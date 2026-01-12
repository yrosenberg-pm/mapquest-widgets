// app/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Settings, X, Check, Copy, Sun, Moon, Palette, Type, Square, Building2, Key, Code, ChevronDown, Grid3X3, Link2, ExternalLink } from 'lucide-react';
import {
  SmartAddressInput,
  StarbucksFinder,
  CitiBikeFinder,
  DirectionsEmbed,
  ServiceAreaChecker,
  NeighborhoodScore,
  MultiStopPlanner,
  DeliveryETA,
  InstacartDeliveryETA,
  NHLArenaExplorer,
  HereIsolineWidget,
} from '@/components/widgets';

const API_KEY = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

type WidgetId = 'nhl' | 'address' | 'starbucks' | 'citibike' | 'directions' | 'service' | 'neighborhood' | 'multistop' | 'delivery' | 'instacart' | 'here-isoline';

const WIDGETS = [
  { id: 'nhl' as WidgetId, name: 'NHL Arena Explorer', description: 'Explore all 32 NHL arenas with nearby amenities', isCustom: true },
  { id: 'address' as WidgetId, name: 'Smart Address Input', description: 'Autocomplete address entry with validation', category: 'Quick Win' },
  { id: 'starbucks' as WidgetId, name: 'Starbucks Finder', description: 'Find nearby Starbucks locations', category: 'Quick Win' },
  { id: 'citibike' as WidgetId, name: 'Citi Bike Finder', description: 'Find available bikes and docking stations', category: 'Quick Win' },
  { id: 'directions' as WidgetId, name: 'Directions Embed', description: 'Turn-by-turn directions between locations', category: 'Quick Win' },
  { id: 'service' as WidgetId, name: 'Service Area Checker', description: 'Check if address is within service range', category: 'Quick Win' },
  { id: 'neighborhood' as WidgetId, name: 'Neighborhood Score', description: 'Walk score-style area analysis', category: 'Bigger Bet' },
  { id: 'multistop' as WidgetId, name: 'Multi-Stop Planner', description: 'Optimize routes with multiple destinations', category: 'Bigger Bet' },
  { id: 'delivery' as WidgetId, name: 'Delivery ETA', description: 'Real-time delivery tracking and estimates', category: 'Bigger Bet' },
  { id: 'instacart' as WidgetId, name: 'Instacart Delivery', description: 'Grocery delivery tracking with Instacart branding', category: 'Bigger Bet' },
  { id: 'here-isoline' as WidgetId, name: 'Isoline Visualizer', description: 'Reachable area within travel time (HERE API)', category: 'Bigger Bet' },
];

const ACCENT_COLORS = [
  { name: 'Blue', value: '#2563eb' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Purple', value: '#9333ea' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Pink', value: '#db2777' },
  { name: 'Teal', value: '#0d9488' },
];

const FONT_OPTIONS = [
  { name: 'System', value: 'system-ui, -apple-system, sans-serif' },
  { name: 'Inter', value: 'Inter, sans-serif' },
  { name: 'Roboto', value: 'Roboto, sans-serif' },
  { name: 'Open Sans', value: '"Open Sans", sans-serif' },
  { name: 'Poppins', value: 'Poppins, sans-serif' },
];

const RADIUS_OPTIONS = [
  { name: 'None', value: '0' },
  { name: 'Small', value: '0.375rem' },
  { name: 'Medium', value: '0.5rem' },
  { name: 'Large', value: '0.75rem' },
  { name: 'XL', value: '1rem' },
];

export default function Home() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Check for embed mode and widget from URL
  const embedMode = searchParams.get('embed') === 'true';
  const urlWidget = searchParams.get('widget') as WidgetId | null;
  
  const [activeWidget, setActiveWidget] = useState<WidgetId>('nhl');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('theme');
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Customization state
  const [darkMode, setDarkMode] = useState(false);
  const [accentColor, setAccentColor] = useState('#2563eb');
  const [customColor, setCustomColor] = useState('#2563eb');
  const [fontFamily, setFontFamily] = useState('system-ui, -apple-system, sans-serif');
  const [borderRadius, setBorderRadius] = useState('0.5rem');
  const [brandingMode, setBrandingMode] = useState<'mapquest' | 'cobranded' | 'whitelabel'>('mapquest');
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const savedPrefs = localStorage.getItem('widgetPreferences');
      if (savedPrefs) {
        const prefs = JSON.parse(savedPrefs);
        if (prefs.darkMode !== undefined) setDarkMode(prefs.darkMode);
        if (prefs.accentColor) setAccentColor(prefs.accentColor);
        if (prefs.customColor) setCustomColor(prefs.customColor);
        if (prefs.fontFamily) setFontFamily(prefs.fontFamily);
        if (prefs.borderRadius) setBorderRadius(prefs.borderRadius);
        if (prefs.brandingMode) setBrandingMode(prefs.brandingMode);
        if (prefs.companyName) setCompanyName(prefs.companyName);
        if (prefs.companyLogo) setCompanyLogo(prefs.companyLogo);
        // Only use saved widget if no URL parameter
        if (!urlWidget && prefs.activeWidget) setActiveWidget(prefs.activeWidget);
      }
    } catch (e) {
      console.error('Failed to load preferences:', e);
    }
    setPrefsLoaded(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Set widget from URL parameter (takes priority)
  useEffect(() => {
    if (urlWidget && WIDGETS.some(w => w.id === urlWidget)) {
      setActiveWidget(urlWidget);
    }
  }, [urlWidget]);

  // Save preferences to localStorage when they change
  useEffect(() => {
    if (!prefsLoaded) return; // Don't save until initial load is complete
    try {
      const prefs = {
        darkMode,
        accentColor,
        customColor,
        fontFamily,
        borderRadius,
        brandingMode,
        companyName,
        companyLogo,
        activeWidget,
      };
      localStorage.setItem('widgetPreferences', JSON.stringify(prefs));
    } catch (e) {
      console.error('Failed to save preferences:', e);
    }
  }, [prefsLoaded, darkMode, accentColor, customColor, fontFamily, borderRadius, brandingMode, companyName, companyLogo, activeWidget]);

  const currentWidget = WIDGETS.find(w => w.id === activeWidget);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleWidgetSelect = (widgetId: WidgetId) => {
    setActiveWidget(widgetId);
    setMenuOpen(false);
  };

  const generateEmbedCode = () => {
    const props = [
      `apiKey="YOUR_API_KEY"`,
      darkMode && `darkMode={true}`,
      accentColor !== '#2563eb' && `accentColor="${accentColor}"`,
      fontFamily !== 'system-ui, -apple-system, sans-serif' && `fontFamily="${fontFamily}"`,
      borderRadius !== '0.5rem' && `borderRadius="${borderRadius}"`,
      brandingMode === 'whitelabel' && `showBranding={false}`,
      brandingMode === 'cobranded' && companyName && `companyName="${companyName}"`,
    ].filter(Boolean).join('\n  ');

    return `<${currentWidget?.name.replace(/\s/g, '')}\n  ${props}\n/>`;
  };

  const copyEmbedCode = () => {
    navigator.clipboard.writeText(generateEmbedCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate permalink for current widget
  const getWidgetPermalink = (embed: boolean = true) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/?widget=${activeWidget}${embed ? '&embed=true' : ''}`;
  };

  const copyPermalink = () => {
    navigator.clipboard.writeText(getWidgetPermalink(true));
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const renderWidget = () => {
    const commonProps = {
      apiKey: API_KEY,
      darkMode,
      accentColor,
      fontFamily,
      borderRadius,
      showBranding: brandingMode !== 'whitelabel',
      companyName: brandingMode === 'cobranded' ? companyName : undefined,
      companyLogo: brandingMode === 'cobranded' ? companyLogo : undefined,
    };

    switch (activeWidget) {
      case 'nhl':
        return <NHLArenaExplorer {...commonProps} />;
      case 'address':
        return <SmartAddressInput {...commonProps} onAddressSelect={(a) => console.log('Selected:', a)} />;
      case 'starbucks':
        return <StarbucksFinder {...commonProps} />;
      case 'citibike':
        return <CitiBikeFinder {...commonProps} />;
      case 'directions':
        return <DirectionsEmbed {...commonProps} />;
      case 'service':
        return <ServiceAreaChecker {...commonProps} serviceCenter={{ lat: 47.6062, lng: -122.3321 }} serviceRadiusMiles={15} />;
      case 'neighborhood':
        return <NeighborhoodScore {...commonProps} />;
      case 'multistop':
        return <MultiStopPlanner {...commonProps} />;
      case 'delivery':
        return <DeliveryETA {...commonProps} destinationAddress="123 Main St, Seattle, WA 98101" />;
      case 'instacart':
        return <InstacartDeliveryETA {...commonProps} destinationAddress="123 Main St, Seattle, WA 98101" />;
      case 'here-isoline':
        return <HereIsolineWidget {...commonProps} defaultTimeMinutes={15} />;
      default:
        return null;
    }
  };

  // Embed mode: show only the widget without header/menu
  if (embedMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="shadow-2xl shadow-gray-400/30 rounded-xl">
          {renderWidget()}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ minHeight: '100vh' }}>
      <div className="p-6">
        <div className="max-w-6xl mx-auto">
        {/* Compact Header with Widget Selector */}
        <div className="flex items-center justify-between mb-6">
          {/* Widget Selector Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white shadow-lg shadow-gray-200/80 hover:shadow-xl transition-all"
            >
              <Grid3X3 className="w-5 h-5 text-gray-500" />
              <div className="text-left">
                <div className="text-sm font-semibold text-gray-900">{currentWidget?.name}</div>
                <div className="text-xs text-gray-500">{currentWidget?.description}</div>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {menuOpen && (
              <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-xl shadow-2xl shadow-gray-300/50 border border-gray-100 overflow-hidden z-50">
                <div className="p-2 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-2">Select Widget</p>
                </div>
                <div className="max-h-[400px] overflow-y-auto p-2">
                  {WIDGETS.map((widget) => {
                    const isActive = activeWidget === widget.id;
                    return (
                      <button
                        key={widget.id}
                        onClick={() => handleWidgetSelect(widget.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                          isActive 
                            ? 'bg-blue-50 border border-blue-200' 
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <div 
                          className={`w-2 h-2 rounded-full flex-shrink-0`}
                          style={{ backgroundColor: isActive ? (widget.isCustom ? '#f97316' : accentColor) : '#d1d5db' }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-gray-900'}`}>
                            {widget.name}
                          </div>
                          <div className="text-xs text-gray-500 truncate">{widget.description}</div>
                        </div>
                        {isActive && <Check className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Controls - Always Visible */}
          <div className="flex items-center gap-2">
            {/* Share/Permalink Button */}
            <button
              onClick={copyPermalink}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white text-gray-600 shadow-lg shadow-gray-200/80 hover:shadow-xl hover:bg-gray-50 transition-all"
              title="Copy shareable link (embed mode)"
            >
              {copiedLink ? <Check className="w-4 h-4 text-green-500" /> : <Link2 className="w-4 h-4" />}
              <span className="hidden sm:inline text-sm">{copiedLink ? 'Copied!' : 'Share'}</span>
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2.5 rounded-xl bg-white text-gray-600 shadow-lg shadow-gray-200/80 hover:shadow-xl hover:bg-gray-50 transition-all"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium bg-white text-gray-600 shadow-lg shadow-gray-200/80 hover:shadow-xl hover:bg-gray-50 transition-all"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Customize</span>
            </button>
          </div>
        </div>

        {/* Widget Display */}
        <div className="flex flex-col items-center">
          <div className="shadow-2xl shadow-gray-400/30 rounded-xl">
            {renderWidget()}
          </div>
          {activeWidget === 'address' && (
            <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-3`}>
              Powered by <strong>MapQuest</strong>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className={`w-full max-w-2xl rounded-2xl shadow-2xl ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
            {/* Modal Header */}
            <div className={`flex items-center justify-between p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Customize Widget
              </h2>
              <button onClick={() => setShowSettings(false)} className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex">
              {/* Sidebar */}
              <div className={`w-48 p-2 border-r ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                {[
                  { id: 'theme', icon: Sun, label: 'Theme' },
                  { id: 'colors', icon: Palette, label: 'Colors' },
                  { id: 'typography', icon: Type, label: 'Typography' },
                  { id: 'shape', icon: Square, label: 'Shape' },
                  { id: 'branding', icon: Building2, label: 'Branding' },
                  { id: 'embed', icon: Code, label: 'Embed Code' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setSettingsTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      settingsTab === tab.id
                        ? darkMode ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
                        : darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 p-6">
                {settingsTab === 'theme' && (
                  <div>
                    <h3 className={`font-medium mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Appearance</h3>
                    <div className="flex gap-4">
                      <button
                        onClick={() => setDarkMode(false)}
                        className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                          !darkMode ? 'border-blue-500 bg-blue-50' : darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200'
                        }`}
                      >
                        <Sun className={`w-6 h-6 mx-auto mb-2 ${!darkMode ? 'text-blue-500' : darkMode ? 'text-gray-400' : 'text-gray-400'}`} />
                        <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Light</p>
                      </button>
                      <button
                        onClick={() => setDarkMode(true)}
                        className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                          darkMode ? 'border-blue-500 bg-blue-500/10' : 'border-gray-200'
                        }`}
                      >
                        <Moon className={`w-6 h-6 mx-auto mb-2 ${darkMode ? 'text-blue-400' : 'text-gray-400'}`} />
                        <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Dark</p>
                      </button>
                    </div>
                  </div>
                )}

                {settingsTab === 'colors' && (
                  <div>
                    <h3 className={`font-medium mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Accent Color</h3>
                    <div className="grid grid-cols-6 gap-3 mb-6">
                      {ACCENT_COLORS.map((color) => (
                        <button
                          key={color.value}
                          onClick={() => setAccentColor(color.value)}
                          className={`w-10 h-10 rounded-full border-2 transition-transform hover:scale-110 ${
                            accentColor === color.value ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color.value }}
                          title={color.name}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <label className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Custom:</label>
                      <input
                        type="color"
                        value={customColor}
                        onChange={(e) => {
                          setCustomColor(e.target.value);
                          setAccentColor(e.target.value);
                        }}
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm font-mono ${
                          darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200'
                        }`}
                        placeholder="#2563eb"
                      />
                    </div>
                  </div>
                )}

                {settingsTab === 'typography' && (
                  <div>
                    <h3 className={`font-medium mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Font Family</h3>
                    <div className="space-y-2">
                      {FONT_OPTIONS.map((font) => (
                        <button
                          key={font.name}
                          onClick={() => setFontFamily(font.value)}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
                            fontFamily === font.value
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                              : darkMode ? 'border-gray-700 hover:border-gray-600' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <span className={darkMode ? 'text-white' : 'text-gray-900'} style={{ fontFamily: font.value }}>
                            {font.name}
                          </span>
                          <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} style={{ fontFamily: font.value }}>
                            Aa Bb Cc 123
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {settingsTab === 'shape' && (
                  <div>
                    <h3 className={`font-medium mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Border Radius</h3>
                    <div className="grid grid-cols-5 gap-3">
                      {RADIUS_OPTIONS.map((radius) => (
                        <button
                          key={radius.name}
                          onClick={() => setBorderRadius(radius.value)}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            borderRadius === radius.value
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                              : darkMode ? 'border-gray-700' : 'border-gray-200'
                          }`}
                        >
                          <div
                            className={`w-8 h-8 mx-auto mb-2 ${darkMode ? 'bg-gray-600' : 'bg-gray-300'}`}
                            style={{ borderRadius: radius.value }}
                          />
                          <p className={`text-xs font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{radius.name}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {settingsTab === 'branding' && (
                  <div>
                    <h3 className={`font-medium mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Branding Options</h3>
                    <div className="space-y-3 mb-6">
                      {[
                        { id: 'mapquest', label: 'MapQuest Branded', desc: 'Shows "Powered by MapQuest"' },
                        { id: 'cobranded', label: 'Co-branded', desc: 'Your logo + MapQuest' },
                        { id: 'whitelabel', label: 'White Label', desc: 'No MapQuest branding' },
                      ].map((option) => (
                        <button
                          key={option.id}
                          onClick={() => setBrandingMode(option.id as typeof brandingMode)}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
                            brandingMode === option.id
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                              : darkMode ? 'border-gray-700' : 'border-gray-200'
                          }`}
                        >
                          <div className="text-left">
                            <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{option.label}</p>
                            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{option.desc}</p>
                          </div>
                          {brandingMode === option.id && <Check className="w-5 h-5 text-blue-500" />}
                        </button>
                      ))}
                    </div>

                    {brandingMode === 'cobranded' && (
                      <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-white' : 'text-gray-700'}`}>
                            Company Name
                          </label>
                          <input
                            type="text"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            placeholder="Your Company"
                            className={`w-full px-3 py-2 rounded-lg border ${
                              darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200'
                            }`}
                          />
                        </div>
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-white' : 'text-gray-700'}`}>
                            Logo
                          </label>
                          <div className="space-y-2">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  console.log('File selected:', file.name, file.type, file.size);
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    const result = reader.result as string;
                                    console.log('File read complete, data URL length:', result.length);
                                    setCompanyLogo(result);
                                    console.log('Company logo set to:', result.substring(0, 50) + '...');
                                  };
                                  reader.onerror = (error) => {
                                    console.error('Error reading file:', error);
                                  };
                                  reader.readAsDataURL(file);
                                } else {
                                  console.log('No file selected');
                                }
                              }}
                              className={`w-full px-3 py-2 rounded-lg border text-sm ${
                                darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200'
                              }`}
                            />
                            <input
                              type="text"
                              value={companyLogo}
                              onChange={(e) => setCompanyLogo(e.target.value)}
                              placeholder="Or enter logo URL: https://example.com/logo.png"
                              className={`w-full px-3 py-2 rounded-lg border ${
                                darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200'
                              }`}
                            />
                            {companyLogo && (
                              <div className="mt-2 p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
                                <div className="flex items-center justify-between mb-2">
                                  <p className={`text-xs font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Logo Preview:</p>
                                  <button
                                    onClick={() => {
                                      setCompanyLogo('');
                                      // Reset file input
                                      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
                                      if (fileInput) fileInput.value = '';
                                    }}
                                    className="text-xs text-red-500 hover:text-red-600"
                                  >
                                    Remove
                                  </button>
                                </div>
                                <div className="flex items-center justify-center min-h-[80px] bg-white dark:bg-gray-900 rounded p-3 border border-gray-200 dark:border-gray-700 relative">
                                  <img 
                                    src={companyLogo} 
                                    alt="Company logo preview" 
                                    className="max-h-20 max-w-full object-contain"
                                    onError={(e) => {
                                      console.error('Image load error:', e);
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                      const parent = target.parentElement;
                                      if (parent) {
                                        let errorMsg = parent.querySelector('.error-msg');
                                        if (!errorMsg) {
                                          errorMsg = document.createElement('div');
                                          errorMsg.className = 'error-msg text-xs text-red-500 text-center';
                                          errorMsg.textContent = 'Failed to load image. Please check the URL or try a different image.';
                                          parent.appendChild(errorMsg);
                                        }
                                        (errorMsg as HTMLElement).style.display = 'block';
                                      }
                                    }}
                                    onLoad={(e) => {
                                      console.log('Image loaded successfully');
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'block';
                                      const parent = target.parentElement;
                                      if (parent) {
                                        const errorMsg = parent.querySelector('.error-msg');
                                        if (errorMsg) {
                                          (errorMsg as HTMLElement).style.display = 'none';
                                        }
                                      }
                                    }}
                                  />
                                </div>
                                <p className={`text-xs mt-2 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                  {companyLogo.startsWith('data:') 
                                    ? `Uploaded image (${Math.round(companyLogo.length / 1024)}KB)` 
                                    : `Image URL: ${companyLogo.substring(0, 50)}${companyLogo.length > 50 ? '...' : ''}`}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {settingsTab === 'embed' && (
                  <div>
                    <h3 className={`font-medium mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Embed Code</h3>
                    <div className="relative rounded-lg overflow-hidden bg-gray-900">
                      <pre className="p-4 text-sm text-gray-300 overflow-x-auto">
                        <code>{generateEmbedCode()}</code>
                      </pre>
                      <button
                        onClick={copyEmbedCode}
                        className="absolute top-2 right-2 flex items-center gap-1 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-sm"
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}