import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const MQ_API_KEY = process.env.MAPQUEST_API_KEY || process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

interface CategoryScoreContext {
  name: string;
  score: number;
  description: string;
  poiCount: number;
  closestDistance: number;
  places: Array<{ name: string; distance: number }>;
}

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
): Promise<Array<{ name: string; distance: number; address?: string; lat?: number; lng?: number }>> {
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
      return { name: r.name || 'Unknown', distance: Math.round(distance * 100) / 100, address: addr, lat: pLat, lng: pLng };
    }).filter((p: any) => p.distance <= radiusMiles);
  } catch {
    return [];
  }
}

function buildSystemPrompt(
  address: string,
  lat: number,
  lng: number,
  categoryScores: CategoryScoreContext[]
): string {
  const scoresSummary = categoryScores.map(cs => {
    const topPlaces = cs.places.slice(0, 5).map(p => `  - ${p.name} (${p.distance.toFixed(2)} mi)`).join('\n');
    return `${cs.name}: ${cs.score.toFixed(1)}/5 — ${cs.poiCount} found, closest at ${cs.closestDistance === Infinity ? 'N/A' : cs.closestDistance.toFixed(2) + ' mi'}\n${topPlaces}`;
  }).join('\n\n');

  return `You are a helpful neighborhood assistant for the address: "${address}" (${lat.toFixed(5)}, ${lng.toFixed(5)}).

You have access to neighborhood scoring data showing nearby amenities. Here is the current data:

${scoresSummary || 'No scores have been calculated yet. The user needs to calculate scores first for full data.'}

GUIDELINES:
- Answer questions about the neighborhood, nearby places, walkability, and livability.
- When the user asks about the closest place of a certain type, check the data above first. If the data doesn't cover that category, use the search_nearby_places tool to find results.
- Keep answers concise (2-4 sentences max) and conversational.
- Use distances in miles. Format numbers neatly.
- If scores haven't been calculated yet, let the user know they should click "Calculate Scores" first for the best experience.
- You can reference specific place names and distances from the data.
- If asked about something outside your data (e.g. crime, home prices), be honest that you don't have that data.
- Do NOT make up places or distances — only reference what's in the data above or from tool results.`;
}

const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'search_nearby_places',
    description: 'Search for nearby places of a specific type that are not already in the neighborhood scores data. Use this when the user asks about a category or place type not covered by the existing data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query, e.g. "hospital", "library", "dog park", "pizza"',
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
  const { message, history, address, lat, lng, categoryScores } = body as {
    message: string;
    history: ChatMessage[];
    address: string;
    lat: number;
    lng: number;
    categoryScores: CategoryScoreContext[];
  };

  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey });
  const systemPrompt = buildSystemPrompt(address, lat, lng, categoryScores || []);

  const messages: Anthropic.MessageParam[] = [
    ...(history || []).map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user', content: message },
  ];

  try {
    let response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      system: systemPrompt,
      messages,
      tools: lat && lng ? TOOL_DEFINITIONS : undefined,
      max_tokens: 500,
    });

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        if (block.name === 'search_nearby_places') {
          const args = block.input as { query: string; radius_miles?: number };
          const results = await searchPlacesForChat(lat, lng, args.query, args.radius_miles || 2, 10);
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
