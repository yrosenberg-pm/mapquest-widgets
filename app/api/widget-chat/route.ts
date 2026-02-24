import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const MQ_API_KEY = process.env.MAPQUEST_API_KEY || process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function searchPlacesForChat(
  lat: number,
  lng: number,
  query: string,
  radiusMiles: number = 2,
  maxResults: number = 10
): Promise<Array<{ name: string; distance: number; address?: string }>> {
  try {
    const url = `https://www.mapquestapi.com/search/v4/place?key=${MQ_API_KEY}&location=${lng},${lat}&sort=distance&q=${encodeURIComponent(query)}&pageSize=${maxResults}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    const R = 3959;
    return (data.results || []).map((r: any) => {
      const coords = r.place?.geometry?.coordinates;
      let pLat: number | undefined;
      let pLng: number | undefined;
      let distance = 0;
      if (coords && coords.length >= 2) {
        pLng = coords[0];
        pLat = coords[1];
        const dLat = (pLat! - lat) * Math.PI / 180;
        const dLon = (pLng! - lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(pLat! * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }
      const addr = r.place?.properties?.street
        ? `${r.place.properties.street}, ${r.place.properties.city || ''}`
        : undefined;
      return { name: r.name || 'Unknown', distance: Math.round(distance * 100) / 100, address: addr };
    }).filter((p: any) => p.distance <= radiusMiles);
  } catch {
    return [];
  }
}

const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'search_nearby_places',
    description: 'Search for nearby places of a specific type. Use when the user asks about a place type not in the existing data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query, e.g. "hospital", "library", "gas station", "pizza"',
        },
        radius_miles: {
          type: 'number',
          description: 'Search radius in miles (default 2)',
        },
      },
      required: ['query'],
    },
  },
];

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Anthropic API key not configured. Add ANTHROPIC_API_KEY to .env.local' },
      { status: 500 }
    );
  }

  const body = await req.json();
  const { message, history, context, lat, lng } = body as {
    message: string;
    history: ChatMessage[];
    context: string;
    lat?: number;
    lng?: number;
  };

  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey });

  const systemPrompt = `You are a helpful assistant embedded in a MapQuest widget. Answer questions using the data provided below.

${context || 'No widget data available yet.'}

GUIDELINES:
- Keep answers concise (2-4 sentences max) and conversational.
- Use distances in miles, temperatures in °F. Format numbers neatly.
- Only reference data that is provided above or returned from tools. Do NOT make up places, distances, or weather data.
- If the data hasn't been loaded yet, suggest the user run the relevant action first (e.g. "Calculate Scores" or "Get Weather & Alerts").
- If asked about something outside your data, be honest that you don't have that information.`;

  const messages: Anthropic.MessageParam[] = [
    ...(history || []).map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user', content: message },
  ];

  const hasLocation = typeof lat === 'number' && typeof lng === 'number' && lat !== 0 && lng !== 0;

  try {
    let response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      system: systemPrompt,
      messages,
      tools: hasLocation ? TOOL_DEFINITIONS : undefined,
      max_tokens: 500,
    });

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        if (block.name === 'search_nearby_places' && hasLocation) {
          const args = block.input as { query: string; radius_miles?: number };
          const results = await searchPlacesForChat(lat!, lng!, args.query, args.radius_miles || 2, 10);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(results),
          });
        }
      }

      response = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        system: systemPrompt,
        messages: [
          ...messages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ],
        max_tokens: 500,
      });
    }

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text'
    );

    return NextResponse.json({ reply: textBlock?.text || 'No response generated.' });
  } catch (err: any) {
    console.error('Chat error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to generate response' },
      { status: 500 }
    );
  }
}
