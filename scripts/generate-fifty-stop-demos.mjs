#!/usr/bin/env node
/**
 * One-time generator: geocode curated delivery addresses per demo city and write
 * lib/demo/fiftyStopDemosByRegion.ts for reuse in Multi-Stop Planner.
 *
 * Usage: node scripts/generate-fifty-stop-demos.mjs
 * Requires MAPQUEST_API_KEY or NEXT_PUBLIC_MAPQUEST_API_KEY in .env.local
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

loadEnv();

const API_KEY = process.env.MAPQUEST_API_KEY || process.env.NEXT_PUBLIC_MAPQUEST_API_KEY;
if (!API_KEY) {
  console.error('Missing MAPQUEST_API_KEY');
  process.exit(1);
}

/** Curated land-based street addresses — 49 deliveries per city. */
const SEEDS = {
  seattle: {
    depot: '400 Broad St, Seattle, WA 98109',
    deliveries: [
      '85 Pike St, Seattle, WA 98101', '1501 Pike Pl, Seattle, WA 98101', '1928 Post Alley, Seattle, WA 98101',
      '601 E Pike St, Seattle, WA 98122', '1427 Broadway, Seattle, WA 98122', '1301 Madison St, Seattle, WA 98104',
      '999 Third Ave, Seattle, WA 98104', '700 5th Ave, Seattle, WA 98104', '1201 3rd Ave, Seattle, WA 98101',
      '4500 University Way NE, Seattle, WA 98105', '1410 NE Campus Pkwy, Seattle, WA 98105', '4735 University Way NE, Seattle, WA 98105',
      '3621 Fremont Ave N, Seattle, WA 98103', '3417 Fremont Ave N, Seattle, WA 98103', '3501 Fremont Ave N, Seattle, WA 98103',
      '5300 Ballard Ave NW, Seattle, WA 98107', '2200 NW Market St, Seattle, WA 98107', '5449 Ballard Ave NW, Seattle, WA 98107',
      '4810 E Green Lake Way N, Seattle, WA 98105', '7201 East Green Lake Dr N, Seattle, WA 98115', '6800 E Green Lake Way N, Seattle, WA 98115',
      '3801 Beacon Ave S, Seattle, WA 98108', '4850 Rainier Ave S, Seattle, WA 98118', '5600 Rainier Ave S, Seattle, WA 98118',
      '4500 8th Ave NE, Seattle, WA 98105', '6500 Roosevelt Way NE, Seattle, WA 98115', '7500 35th Ave NE, Seattle, WA 98115',
      '2801 Alaskan Way, Seattle, WA 98121', '2200 Westlake Ave, Seattle, WA 98121', '600 Pine St, Seattle, WA 98101',
      '401 Pine St, Seattle, WA 98101', '1401 Broadway, Seattle, WA 98122', '1701 Broadway, Seattle, WA 98122',
      '4221 University Way NE, Seattle, WA 98105', '500 Broadway E, Seattle, WA 98102', '600 Broadway E, Seattle, WA 98102',
      '2300 East Madison St, Seattle, WA 98112', '2400 East Madison St, Seattle, WA 98112', '3010 East Madison St, Seattle, WA 98112',
      '3500 Rainier Ave S, Seattle, WA 98144', '3800 Rainier Ave S, Seattle, WA 98144', '4100 Rainier Ave S, Seattle, WA 98144',
      '1000 4th Ave, Seattle, WA 98164', '1100 4th Ave, Seattle, WA 98101', '1200 4th Ave, Seattle, WA 98101',
      '2100 6th Ave, Seattle, WA 98121', '2200 6th Ave, Seattle, WA 98121', '2300 6th Ave, Seattle, WA 98121',
      '3200 15th Ave W, Seattle, WA 98119', '3400 15th Ave W, Seattle, WA 98119',
    ],
  },
  'los-angeles': {
    depot: '200 N Spring St, Los Angeles, CA 90012',
    deliveries: [
      '800 W Olympic Blvd, Los Angeles, CA 90015', '1000 S Figueroa St, Los Angeles, CA 90015', '1111 S Figueroa St, Los Angeles, CA 90015',
      '700 W 7th St, Los Angeles, CA 90017', '800 W 7th St, Los Angeles, CA 90017', '900 W 7th St, Los Angeles, CA 90017',
      '630 W 6th St, Los Angeles, CA 90017', '730 W 6th St, Los Angeles, CA 90017', '830 W 6th St, Los Angeles, CA 90017',
      '1800 N Highland Ave, Los Angeles, CA 90028', '1900 N Highland Ave, Los Angeles, CA 90028', '2000 N Highland Ave, Los Angeles, CA 90028',
      '6801 Hollywood Blvd, Los Angeles, CA 90028', '6901 Hollywood Blvd, Los Angeles, CA 90028', '7001 Hollywood Blvd, Los Angeles, CA 90028',
      '10250 Santa Monica Blvd, Los Angeles, CA 90067', '10350 Santa Monica Blvd, Los Angeles, CA 90067', '10450 Santa Monica Blvd, Los Angeles, CA 90067',
      '10899 Wilshire Blvd, Los Angeles, CA 90024', '10999 Wilshire Blvd, Los Angeles, CA 90024', '11099 Wilshire Blvd, Los Angeles, CA 90024',
      '3400 W 3rd St, Los Angeles, CA 90020', '3500 W 3rd St, Los Angeles, CA 90020', '3600 W 3rd St, Los Angeles, CA 90020',
      '4300 Sunset Blvd, Los Angeles, CA 90027', '4400 Sunset Blvd, Los Angeles, CA 90027', '4500 Sunset Blvd, Los Angeles, CA 90027',
      '4700 Melrose Ave, Los Angeles, CA 90029', '4800 Melrose Ave, Los Angeles, CA 90029', '4900 Melrose Ave, Los Angeles, CA 90029',
      '1200 S Figueroa St, Los Angeles, CA 90015', '1300 S Figueroa St, Los Angeles, CA 90015', '1400 S Figueroa St, Los Angeles, CA 90015',
      '2500 E 1st St, Los Angeles, CA 90033', '2600 E 1st St, Los Angeles, CA 90033', '2700 E 1st St, Los Angeles, CA 90033',
      '3700 E Cesar E Chavez Ave, Los Angeles, CA 90063', '3800 E Cesar E Chavez Ave, Los Angeles, CA 90063', '3900 E Cesar E Chavez Ave, Los Angeles, CA 90063',
      '5000 W Pico Blvd, Los Angeles, CA 90019', '5100 W Pico Blvd, Los Angeles, CA 90019', '5200 W Pico Blvd, Los Angeles, CA 90019',
      '6000 W Sunset Blvd, Los Angeles, CA 90028', '6100 W Sunset Blvd, Los Angeles, CA 90028', '6200 W Sunset Blvd, Los Angeles, CA 90028',
      '1500 S La Brea Ave, Los Angeles, CA 90019', '1600 S La Brea Ave, Los Angeles, CA 90019', '1700 S La Brea Ave, Los Angeles, CA 90019',
      '2200 E Colorado Blvd, Pasadena, CA 91107', '2300 E Colorado Blvd, Pasadena, CA 91107',
    ],
  },
  'new-york': {
    depot: '350 5th Ave, New York, NY 10118',
    deliveries: [
      '1 Times Sq, New York, NY 10036', '11 Times Sq, New York, NY 10036', '20 Times Sq, New York, NY 10036',
      '1560 Broadway, New York, NY 10036', '1570 Broadway, New York, NY 10036', '1580 Broadway, New York, NY 10036',
      '200 Central Park West, New York, NY 10024', '210 Central Park West, New York, NY 10024', '220 Central Park West, New York, NY 10024',
      '1 Penn Plaza, New York, NY 10119', '2 Penn Plaza, New York, NY 10121', '11 Penn Plaza, New York, NY 10001',
      '4 Pennsylvania Plaza, New York, NY 10001', '5 Pennsylvania Plaza, New York, NY 10001', '6 Pennsylvania Plaza, New York, NY 10001',
      '100 Wall St, New York, NY 10005', '110 Wall St, New York, NY 10005', '120 Wall St, New York, NY 10005',
      '200 Park Ave, New York, NY 10166', '210 Park Ave, New York, NY 10166', '220 Park Ave, New York, NY 10166',
      '350 Madison Ave, New York, NY 10017', '360 Madison Ave, New York, NY 10017', '370 Madison Ave, New York, NY 10017',
      '450 Lexington Ave, New York, NY 10017', '460 Lexington Ave, New York, NY 10017', '470 Lexington Ave, New York, NY 10017',
      '1 World Trade Center, New York, NY 10007', '3 World Trade Center, New York, NY 10007', '4 World Trade Center, New York, NY 10007',
      '75 9th Ave, New York, NY 10011', '85 9th Ave, New York, NY 10011', '95 9th Ave, New York, NY 10011',
      '200 Varick St, New York, NY 10014', '210 Varick St, New York, NY 10014', '220 Varick St, New York, NY 10014',
      '1000 3rd Ave, New York, NY 10022', '1010 3rd Ave, New York, NY 10022', '1020 3rd Ave, New York, NY 10022',
      '500 Grand St, New York, NY 10002', '510 Grand St, New York, NY 10002', '520 Grand St, New York, NY 10002',
      '1 Rockefeller Plaza, New York, NY 10020', '10 Rockefeller Plaza, New York, NY 10020', '30 Rockefeller Plaza, New York, NY 10112',
      '233 Broadway, New York, NY 10279', '243 Broadway, New York, NY 10279', '253 Broadway, New York, NY 10279',
      '131 E 23rd St, New York, NY 10010', '141 E 23rd St, New York, NY 10010', '151 E 23rd St, New York, NY 10010',
    ],
  },
  london: {
    depot: 'Westminster, London SW1A 0AA, UK',
    deliveries: [
      '10 Downing St, London SW1A 2AA, UK', '20 Deans Yd, London SW1P 3PA, UK', '30 James St, London SW1A 2NP, UK',
      '1 Canada Square, London E14 5AB, UK', '5 Canada Square, London E14 5AQ, UK', '10 Canada Square, London E14 5NR, UK',
      '221B Baker St, London NW1 6XE, UK', '230 Baker St, London NW1 6XE, UK', '240 Baker St, London NW1 6XE, UK',
      'The British Museum, Great Russell St, London WC1B 3DG, UK', '50 Russell Square, London WC1B 4JP, UK', '60 Russell Square, London WC1B 4JP, UK',
      'Tower Bridge Rd, London SE1 2UP, UK', '2 Tower Bridge Rd, London SE1 2UP, UK', '3 Tower Bridge Rd, London SE1 2UP, UK',
      '1 Leicester Square, London WC2H 7NA, UK', '2 Leicester Square, London WC2H 7NA, UK', '3 Leicester Square, London WC2H 7NA, UK',
      '100 Oxford St, London W1D 1LL, UK', '200 Oxford St, London W1D 1LL, UK', '300 Oxford St, London W1D 1LL, UK',
      '1 Piccadilly, London W1J 0DA, UK', '10 Piccadilly, London W1J 0DA, UK', '20 Piccadilly, London W1J 0DA, UK',
      '1 Kensington Gore, London SW7 2AR, UK', '2 Kensington Gore, London SW7 2AR, UK', '3 Kensington Gore, London SW7 2AR, UK',
      '1 Camden High St, London NW1 7JE, UK', '10 Camden High St, London NW1 7JE, UK', '20 Camden High St, London NW1 7JE, UK',
      '1 Brick Lane, London E1 6SB, UK', '10 Brick Lane, London E1 6SB, UK', '20 Brick Lane, London E1 6SB, UK',
      '1 Shoreditch High St, London E1 6JJ, UK', '10 Shoreditch High St, London E1 6JJ, UK', '20 Shoreditch High St, London E1 6JJ, UK',
      '1 Strand, London WC2N 5EH, UK', '10 Strand, London WC2N 5EH, UK', '20 Strand, London WC2N 5EH, UK',
      '1 Fleet St, London EC4Y 1HT, UK', '10 Fleet St, London EC4Y 1HT, UK', '20 Fleet St, London EC4Y 1HT, UK',
      '1 Borough High St, London SE1 1LB, UK', '10 Borough High St, London SE1 1LB, UK', '20 Borough High St, London SE1 1LB, UK',
      '1 Liverpool St, London EC2M 7PY, UK', '10 Liverpool St, London EC2M 7PY, UK', '20 Liverpool St, London EC2M 7PY, UK',
      '1 Kings Cross Rd, London N1 0AP, UK', '10 Kings Cross Rd, London N1 0AP, UK', '20 Kings Cross Rd, London N1 0AP, UK',
    ],
  },
  paris: {
    depot: '5 Av. Anatole France, 75007 Paris, France',
    deliveries: [
      '1 Av. des Champs-Élysées, 75008 Paris, France', '10 Av. des Champs-Élysées, 75008 Paris, France', '20 Av. des Champs-Élysées, 75008 Paris, France',
      '1 Rue de Rivoli, 75001 Paris, France', '10 Rue de Rivoli, 75001 Paris, France', '20 Rue de Rivoli, 75001 Paris, France',
      '1 Place de la Bastille, 75011 Paris, France', '2 Place de la Bastille, 75011 Paris, France', '3 Place de la Bastille, 75011 Paris, France',
      '1 Rue de la Paix, 75002 Paris, France', '10 Rue de la Paix, 75002 Paris, France', '20 Rue de la Paix, 75002 Paris, France',
      '1 Boulevard Haussmann, 75009 Paris, France', '10 Boulevard Haussmann, 75009 Paris, France', '20 Boulevard Haussmann, 75009 Paris, France',
      '1 Rue de Vaugirard, 75006 Paris, France', '10 Rue de Vaugirard, 75006 Paris, France', '20 Rue de Vaugirard, 75006 Paris, France',
      '1 Rue Mouffetard, 75005 Paris, France', '10 Rue Mouffetard, 75005 Paris, France', '20 Rue Mouffetard, 75005 Paris, France',
      '1 Rue de Charonne, 75011 Paris, France', '10 Rue de Charonne, 75011 Paris, France', '20 Rue de Charonne, 75011 Paris, France',
      '1 Rue Oberkampf, 75011 Paris, France', '10 Rue Oberkampf, 75011 Paris, France', '20 Rue Oberkampf, 75011 Paris, France',
      '1 Rue de la Roquette, 75011 Paris, France', '10 Rue de la Roquette, 75011 Paris, France', '20 Rue de la Roquette, 75011 Paris, France',
      '1 Rue du Faubourg Saint-Antoine, 75011 Paris, France', '10 Rue du Faubourg Saint-Antoine, 75011 Paris, France', '20 Rue du Faubourg Saint-Antoine, 75011 Paris, France',
      '1 Rue de Belleville, 75020 Paris, France', '10 Rue de Belleville, 75020 Paris, France', '20 Rue de Belleville, 75020 Paris, France',
      '1 Rue de la Pompe, 75016 Paris, France', '10 Rue de la Pompe, 75016 Paris, France', '20 Rue de la Pompe, 75016 Paris, France',
      '1 Rue de Passy, 75016 Paris, France', '10 Rue de Passy, 75016 Paris, France', '20 Rue de Passy, 75016 Paris, France',
      '1 Rue de Tolbiac, 75013 Paris, France', '10 Rue de Tolbiac, 75013 Paris, France', '20 Rue de Tolbiac, 75013 Paris, France',
      '1 Rue de la Gare, 75013 Paris, France', '10 Rue de la Gare, 75013 Paris, France', '20 Rue de la Gare, 75013 Paris, France',
      '1 Rue du Commerce, 75015 Paris, France', '10 Rue du Commerce, 75015 Paris, France', '20 Rue du Commerce, 75015 Paris, France',
      '1 Rue Lecourbe, 75015 Paris, France', '10 Rue Lecourbe, 75015 Paris, France', '20 Rue Lecourbe, 75015 Paris, France',
    ],
  },
  berlin: {
    depot: 'Pariser Platz, 10117 Berlin, Germany',
    deliveries: [
      'Unter den Linden 1, 10117 Berlin, Germany', 'Unter den Linden 10, 10117 Berlin, Germany', 'Unter den Linden 20, 10117 Berlin, Germany',
      'Friedrichstraße 1, 10117 Berlin, Germany', 'Friedrichstraße 10, 10117 Berlin, Germany', 'Friedrichstraße 20, 10117 Berlin, Germany',
      'Karl-Marx-Allee 1, 10178 Berlin, Germany', 'Karl-Marx-Allee 10, 10178 Berlin, Germany', 'Karl-Marx-Allee 20, 10178 Berlin, Germany',
      'Alexanderplatz 1, 10178 Berlin, Germany', 'Alexanderplatz 2, 10178 Berlin, Germany', 'Alexanderplatz 3, 10178 Berlin, Germany',
      'Potsdamer Platz 1, 10785 Berlin, Germany', 'Potsdamer Platz 2, 10785 Berlin, Germany', 'Potsdamer Platz 3, 10785 Berlin, Germany',
      'Kurfürstendamm 1, 10719 Berlin, Germany', 'Kurfürstendamm 10, 10719 Berlin, Germany', 'Kurfürstendamm 20, 10719 Berlin, Germany',
      'Oranienburger Str. 1, 10178 Berlin, Germany', 'Oranienburger Str. 10, 10178 Berlin, Germany', 'Oranienburger Str. 20, 10178 Berlin, Germany',
      'Torstraße 1, 10119 Berlin, Germany', 'Torstraße 10, 10119 Berlin, Germany', 'Torstraße 20, 10119 Berlin, Germany',
      'Warschauer Str. 1, 10243 Berlin, Germany', 'Warschauer Str. 10, 10243 Berlin, Germany', 'Warschauer Str. 20, 10243 Berlin, Germany',
      'Sonntagstraße 1, 10245 Berlin, Germany', 'Sonntagstraße 10, 10245 Berlin, Germany', 'Sonntagstraße 20, 10245 Berlin, Germany',
      'Kottbusser Damm 1, 10999 Berlin, Germany', 'Kottbusser Damm 10, 10999 Berlin, Germany', 'Kottbusser Damm 20, 10999 Berlin, Germany',
      'Schönhauser Allee 1, 10435 Berlin, Germany', 'Schönhauser Allee 10, 10435 Berlin, Germany', 'Schönhauser Allee 20, 10435 Berlin, Germany',
      'Prenzlauer Allee 1, 10405 Berlin, Germany', 'Prenzlauer Allee 10, 10405 Berlin, Germany', 'Prenzlauer Allee 20, 10405 Berlin, Germany',
      'Stargarder Str. 1, 10437 Berlin, Germany', 'Stargarder Str. 10, 10437 Berlin, Germany', 'Stargarder Str. 20, 10437 Berlin, Germany',
      'Greifswalder Str. 1, 10405 Berlin, Germany', 'Greifswalder Str. 10, 10405 Berlin, Germany', 'Greifswalder Str. 20, 10405 Berlin, Germany',
      'Boxhagener Str. 1, 10245 Berlin, Germany', 'Boxhagener Str. 10, 10245 Berlin, Germany', 'Boxhagener Str. 20, 10245 Berlin, Germany',
      'Karl-Marx-Straße 1, 12043 Berlin, Germany', 'Karl-Marx-Straße 10, 12043 Berlin, Germany', 'Karl-Marx-Straße 20, 12043 Berlin, Germany',
    ],
  },
  tokyo: {
    depot: '3-38-1 Shinjuku, Shinjuku, Tokyo 160-0022, Japan',
    deliveries: [
      '1-1-1 Shinjuku, Shinjuku, Tokyo 160-0022, Japan',
      '2-1-2 Shinjuku, Shinjuku, Tokyo 160-0022, Japan',
      '4-1-4 Shinjuku, Shinjuku, Tokyo 160-0022, Japan',
      '2-2-2 Shibuya, Shibuya, Tokyo 150-0002, Japan',
      '3-2-3 Shibuya, Shibuya, Tokyo 150-0002, Japan',
      '4-2-4 Shibuya, Shibuya, Tokyo 150-0002, Japan',
      '5-2-5 Shibuya, Shibuya, Tokyo 150-0002, Japan',
      '1-3-1 Asakusa, Taito, Tokyo 111-0032, Japan',
      '2-3-2 Asakusa, Taito, Tokyo 111-0032, Japan',
      '5-3-5 Asakusa, Taito, Tokyo 111-0032, Japan',
      '2-4-2 Oshiage, Sumida, Tokyo 131-0045, Japan',
      '3-4-3 Oshiage, Sumida, Tokyo 131-0045, Japan',
      '4-4-4 Oshiage, Sumida, Tokyo 131-0045, Japan',
      '5-5-5 Shiba-koen, Minato, Tokyo 105-0011, Japan',
      '3-6-3 Koraku, Bunkyo, Tokyo 112-0004, Japan',
      '1-7-1 Higashi-Shimbashi, Minato, Tokyo 105-0021, Japan',
      '2-7-2 Higashi-Shimbashi, Minato, Tokyo 105-0021, Japan',
      '3-7-3 Higashi-Shimbashi, Minato, Tokyo 105-0021, Japan',
      '1-8-1 Higashi-Ikebukuro, Toshima, Tokyo 170-0013, Japan',
      '2-8-2 Higashi-Ikebukuro, Toshima, Tokyo 170-0013, Japan',
      '4-8-4 Higashi-Ikebukuro, Toshima, Tokyo 170-0013, Japan',
      '1-9-1 Takadanobaba, Shinjuku, Tokyo 169-0075, Japan',
      '3-9-3 Takadanobaba, Shinjuku, Tokyo 169-0075, Japan',
      '5-9-5 Takadanobaba, Shinjuku, Tokyo 169-0075, Japan',
      '1-10-1 Kabukicho, Shinjuku, Tokyo 160-0021, Japan',
      '2-10-2 Kabukicho, Shinjuku, Tokyo 160-0021, Japan',
      '3-10-3 Kabukicho, Shinjuku, Tokyo 160-0021, Japan',
      '2-11-2 Nihonbashi, Chuo, Tokyo 103-0027, Japan',
      '4-11-4 Nihonbashi, Chuo, Tokyo 103-0027, Japan',
      '4-12-4 Kasumigaseki, Chiyoda, Tokyo 100-0013, Japan',
      '2-13-2 Yoyogi-Kamizono-cho, Shibuya, Tokyo 151-0052, Japan',
      '1-14-1 Ueno, Taito, Tokyo 110-0005, Japan',
      '1-15-1 Akihabara, Chiyoda, Tokyo 101-0021, Japan',
      '5-16-5 Roppongi, Minato, Tokyo 106-0032, Japan',
      '1-17-1 Ginza, Chuo, Tokyo 104-0061, Japan',
      '3-18-3 Odaiba, Minato, Tokyo 135-0091, Japan',
      '1-19-1 Nakano, Nakano, Tokyo 164-0001, Japan',
      '2-19-2 Nakano, Nakano, Tokyo 164-0001, Japan',
      '3-19-3 Nakano, Nakano, Tokyo 164-0001, Japan',
      '4-19-4 Nakano, Nakano, Tokyo 164-0001, Japan',
      '5-19-5 Nakano, Nakano, Tokyo 164-0001, Japan',
      '1-20-1 Kichijoji, Musashino, Tokyo 180-0004, Japan',
      '1-22-1 Meguro, Meguro, Tokyo 153-0063, Japan',
      '5-22-5 Meguro, Meguro, Tokyo 153-0063, Japan',
      '1-23-1 Gotanda, Shinagawa, Tokyo 141-0031, Japan',
      '2-24-2 Ebisu, Shibuya, Tokyo 150-0013, Japan',
      '3-24-3 Ebisu, Shibuya, Tokyo 150-0013, Japan',
      '4-24-4 Ebisu, Shibuya, Tokyo 150-0013, Japan',
      '5-24-5 Ebisu, Shibuya, Tokyo 150-0013, Japan',
      '1-25-1 Harajuku, Shibuya, Tokyo 150-0001, Japan',
      '2-26-2 Ikebukuro, Toshima, Tokyo 170-0014, Japan',
      '3-26-3 Ikebukuro, Toshima, Tokyo 170-0014, Japan',
      '5-26-5 Ikebukuro, Toshima, Tokyo 170-0014, Japan',
      '1-27-1 Shinagawa, Shinagawa, Tokyo 140-0002, Japan',
      '3-28-3 Hamamatsucho, Minato, Tokyo 105-0013, Japan',
      'Tokyo Skytree, 1-1-2 Oshiage, Sumida, Tokyo, Japan',
      '1-1 Yoyogi-Kamizono-cho, Shibuya, Tokyo 151-0052, Japan',
    ],
  },
  sydney: {
    depot: 'Bennelong Point, Sydney NSW 2000, Australia',
    deliveries: [
      '1 George St, Sydney NSW 2000, Australia', '10 George St, Sydney NSW 2000, Australia', '20 George St, Sydney NSW 2000, Australia',
      '1 Pitt St, Sydney NSW 2000, Australia', '10 Pitt St, Sydney NSW 2000, Australia', '20 Pitt St, Sydney NSW 2000, Australia',
      '1 Castlereagh St, Sydney NSW 2000, Australia', '10 Castlereagh St, Sydney NSW 2000, Australia', '20 Castlereagh St, Sydney NSW 2000, Australia',
      '1 Macquarie St, Sydney NSW 2000, Australia', '10 Macquarie St, Sydney NSW 2000, Australia', '20 Macquarie St, Sydney NSW 2000, Australia',
      '1 Oxford St, Darlinghurst NSW 2010, Australia', '10 Oxford St, Darlinghurst NSW 2010, Australia', '20 Oxford St, Darlinghurst NSW 2010, Australia',
      '1 Crown St, Surry Hills NSW 2010, Australia', '10 Crown St, Surry Hills NSW 2010, Australia', '20 Crown St, Surry Hills NSW 2010, Australia',
      '1 King St, Newtown NSW 2042, Australia', '10 King St, Newtown NSW 2042, Australia', '20 King St, Newtown NSW 2042, Australia',
      '1 Glebe Point Rd, Glebe NSW 2037, Australia', '10 Glebe Point Rd, Glebe NSW 2037, Australia', '20 Glebe Point Rd, Glebe NSW 2037, Australia',
      '1 Parramatta Rd, Leichhardt NSW 2040, Australia', '10 Parramatta Rd, Leichhardt NSW 2040, Australia', '20 Parramatta Rd, Leichhardt NSW 2040, Australia',
      '1 Military Rd, Neutral Bay NSW 2089, Australia', '10 Military Rd, Neutral Bay NSW 2089, Australia', '20 Military Rd, Neutral Bay NSW 2089, Australia',
      '1 Miller St, North Sydney NSW 2060, Australia', '10 Miller St, North Sydney NSW 2060, Australia', '20 Miller St, North Sydney NSW 2060, Australia',
      '1 Pacific Hwy, St Leonards NSW 2065, Australia', '10 Pacific Hwy, St Leonards NSW 2065, Australia', '20 Pacific Hwy, St Leonards NSW 2065, Australia',
      '1 Anzac Pde, Kensington NSW 2033, Australia', '10 Anzac Pde, Kensington NSW 2033, Australia', '20 Anzac Pde, Kensington NSW 2033, Australia',
      '1 Botany Rd, Alexandria NSW 2015, Australia', '10 Botany Rd, Alexandria NSW 2015, Australia', '20 Botany Rd, Alexandria NSW 2015, Australia',
      '1 Cleveland St, Redfern NSW 2016, Australia', '10 Cleveland St, Redfern NSW 2016, Australia', '20 Cleveland St, Redfern NSW 2016, Australia',
      '1 Harris St, Pyrmont NSW 2009, Australia', '10 Harris St, Pyrmont NSW 2009, Australia', '20 Harris St, Pyrmont NSW 2009, Australia',
      '1 Darling Dr, Sydney NSW 2000, Australia', '10 Darling Dr, Sydney NSW 2000, Australia', '20 Darling Dr, Sydney NSW 2000, Australia',
      '1 Barangaroo Ave, Barangaroo NSW 2000, Australia', '10 Barangaroo Ave, Barangaroo NSW 2000, Australia', '20 Barangaroo Ave, Barangaroo NSW 2000, Australia',
    ],
  },
  toronto: {
    depot: '301 Front St W, Toronto, ON M5V 2T6, Canada',
    deliveries: [
      '1 Yonge St, Toronto, ON M5E 1W7, Canada', '10 Yonge St, Toronto, ON M5E 1W7, Canada', '20 Yonge St, Toronto, ON M5E 1W7, Canada',
      '1 Bay St, Toronto, ON M5J 2R8, Canada', '10 Bay St, Toronto, ON M5J 2R8, Canada', '20 Bay St, Toronto, ON M5J 2R8, Canada',
      '1 King St W, Toronto, ON M5H 1A1, Canada', '10 King St W, Toronto, ON M5H 1A1, Canada', '20 King St W, Toronto, ON M5H 1A1, Canada',
      '1 Queen St W, Toronto, ON M5H 2M9, Canada', '10 Queen St W, Toronto, ON M5H 2M9, Canada', '20 Queen St W, Toronto, ON M5H 2M9, Canada',
      '1 Bloor St W, Toronto, ON M4W 1A9, Canada', '10 Bloor St W, Toronto, ON M4W 1A9, Canada', '20 Bloor St W, Toronto, ON M4W 1A9, Canada',
      '1 College St, Toronto, ON M5S 3H7, Canada', '10 College St, Toronto, ON M5S 3H7, Canada', '20 College St, Toronto, ON M5S 3H7, Canada',
      '1 Spadina Ave, Toronto, ON M5T 2G3, Canada', '10 Spadina Ave, Toronto, ON M5T 2G3, Canada', '20 Spadina Ave, Toronto, ON M5T 2G3, Canada',
      '1 Bathurst St, Toronto, ON M5V 2P1, Canada', '10 Bathurst St, Toronto, ON M5V 2P1, Canada', '20 Bathurst St, Toronto, ON M5V 2P1, Canada',
      '1 Dundas St W, Toronto, ON M5G 1Z3, Canada', '10 Dundas St W, Toronto, ON M5G 1Z3, Canada', '20 Dundas St W, Toronto, ON M5G 1Z3, Canada',
      '1 Carlton St, Toronto, ON M5B 1L3, Canada', '10 Carlton St, Toronto, ON M5B 1L3, Canada', '20 Carlton St, Toronto, ON M5B 1L3, Canada',
      '1 Jarvis St, Toronto, ON M5C 2H8, Canada', '10 Jarvis St, Toronto, ON M5C 2H8, Canada', '20 Jarvis St, Toronto, ON M5C 2H8, Canada',
      '1 Parliament St, Toronto, ON M5A 2Z4, Canada', '10 Parliament St, Toronto, ON M5A 2Z4, Canada', '20 Parliament St, Toronto, ON M5A 2Z4, Canada',
      '1 Danforth Ave, Toronto, ON M4K 1N2, Canada', '10 Danforth Ave, Toronto, ON M4K 1N2, Canada', '20 Danforth Ave, Toronto, ON M4K 1N2, Canada',
      '1 Queen St E, Toronto, ON M5C 3G5, Canada', '10 Queen St E, Toronto, ON M5C 3G5, Canada', '20 Queen St E, Toronto, ON M5C 3G5, Canada',
      '1 Richmond St W, Toronto, ON M5H 2A4, Canada', '10 Richmond St W, Toronto, ON M5H 2A4, Canada', '20 Richmond St W, Toronto, ON M5H 2A4, Canada',
      '1 Adelaide St W, Toronto, ON M5H 1P6, Canada', '10 Adelaide St W, Toronto, ON M5H 1P6, Canada', '20 Adelaide St W, Toronto, ON M5H 1P6, Canada',
      '1 Wellington St W, Toronto, ON M5J 2T3, Canada', '10 Wellington St W, Toronto, ON M5J 2T3, Canada', '20 Wellington St W, Toronto, ON M5J 2T3, Canada',
    ],
  },
  singapore: {
    depot: 'Gardens by the Bay, 18 Marina Gardens Dr, Singapore',
    deliveries: [
      'Marina Bay Sands, Singapore',
      'Merlion Park, Singapore',
      'ION Orchard, Singapore',
      'VivoCity, Singapore',
      'Jewel Changi Airport, Singapore',
      'Universal Studios Singapore, Sentosa',
      'Bugis Junction, Singapore',
      'Raffles City, Singapore',
      'Clarke Quay, Singapore',
      'Chinatown Complex, Singapore',
      'Mustafa Centre, Little India, Singapore',
      'Sultan Mosque, Kampong Glam, Singapore',
      'East Coast Park, Singapore',
      'Holland Village, Singapore',
      'Tiong Bahru Plaza, Singapore',
      'Jurong Point, Singapore',
      'NEX Serangoon, Singapore',
      'Westgate, Jurong East, Singapore',
      'Parkway Parade, Singapore',
      'National Gallery Singapore',
      'Singapore Botanic Gardens',
      'Plaza Singapura, Singapore',
      'Funan Mall, Singapore',
      'Suntec City, Singapore',
      'Marina Square, Singapore',
      'Esplanade Theatres on the Bay, Singapore',
      'Fullerton Hotel, Singapore',
      'Lau Pa Sat, Singapore',
      'Maxwell Food Centre, Singapore',
      'JEM, Jurong East, Singapore',
      'Causeway Point, Woodlands, Singapore',
      'Waterway Point, Punggol, Singapore',
      'Compass One, Sengkang, Singapore',
      'Bedok Mall, Singapore',
      'Tampines Mall, Singapore',
      'White Sands, Pasir Ris, Singapore',
      'City Square Mall, Singapore',
      'United Square, Novena, Singapore',
      'Tanglin Mall, Singapore',
      'Great World City, Singapore',
      'Alexandra Retail Centre, Singapore',
      'Gillman Barracks, Singapore',
      'Singapore Zoo, Mandai, Singapore',
      'Night Safari Singapore, Mandai',
      'Haji Lane, Kampong Glam, Singapore',
      'Fort Canning Park, Singapore',
      'Changi Village, Singapore',
      'Pulau Ubin Ferry Terminal, Changi Point, Singapore',
      'Bukit Timah Nature Reserve, Singapore',
    ],
  },
  dubai: {
    depot: '1 Sheikh Mohammed bin Rashid Blvd, Dubai, UAE',
    deliveries: [
      'The Dubai Mall, Downtown Dubai, UAE',
      'Mall of the Emirates, Sheikh Zayed Road, Dubai, UAE',
      'Dubai Marina Mall, Dubai Marina, UAE',
      'Ibn Battuta Mall, Jebel Ali, Dubai, UAE',
      'Deira City Centre, Port Saeed, Dubai, UAE',
      'Dubai Festival City Mall, Dubai, UAE',
      'Mercato Shopping Mall, Jumeirah Beach Road, Dubai, UAE',
      'City Centre Mirdif, Dubai, UAE',
      'Souk Madinat Jumeirah, Dubai, UAE',
      'Gold Souk, Deira, Dubai, UAE',
      'Spice Souk, Deira, Dubai, UAE',
      'Dubai Frame, Zabeel Park, Dubai, UAE',
      'Museum of the Future, Sheikh Zayed Road, Dubai, UAE',
      'Jumeirah Beach Hotel, Dubai, UAE',
      'Atlantis The Palm, Crescent Road, Dubai, UAE',
      'Dubai Creek Harbour, Dubai, UAE',
      'Al Seef, Dubai Creek, Dubai, UAE',
      'La Mer, Jumeirah 1, Dubai, UAE',
      'Kite Beach, Jumeirah, Dubai, UAE',
      'Al Mamzar Beach Park, Dubai, UAE',
      'Dubai Opera, Downtown Dubai, UAE',
      'Emirates Towers, Sheikh Zayed Road, Dubai, UAE',
      'World Trade Centre, Sheikh Zayed Road, Dubai, UAE',
      'Dubai Design District, Dubai, UAE',
      'Boxpark, Al Wasl Road, Dubai, UAE',
      'City Walk, Al Safa Street, Dubai, UAE',
      'Bluewaters Island, Dubai, UAE',
      'Ain Dubai, Bluewaters Island, Dubai, UAE',
      'Dubai Hills Mall, Al Khail Road, Dubai, UAE',
      'Dubai Outlet Mall, Dubai-Al Ain Road, UAE',
      'Dragon Mart, International City, Dubai, UAE',
      'IMG Worlds of Adventure, Sheikh Mohammed Bin Zayed Road, Dubai, UAE',
      'City Centre Mirdif, Dubai, UAE',
      'Dubai Parks and Resorts, Sheikh Zayed Road, Dubai, UAE',
      'Legoland Dubai, Sheikh Zayed Road, Dubai, UAE',
      'Motiongate Dubai, Dubai Parks and Resorts, UAE',
      'Dubai Autodrome, Motor City, Dubai, UAE',
      'Al Safa Park, Sheikh Zayed Road, Dubai, UAE',
      'Zabeel Park, Zaabeel, Dubai, UAE',
      'Dubai Silicon Oasis, Dubai, UAE',
      'Dubai Sports City, Dubai, UAE',
      'Arabian Ranches, Dubai, UAE',
      'Jumeirah Lakes Towers, Cluster Y, Dubai, UAE',
      'Business Bay, Executive Towers, Dubai, UAE',
      'DIFC Gate Village, Dubai, UAE',
      'Al Barsha, Mall of the Emirates area, Dubai, UAE',
      'Al Quoz, Alserkal Avenue, Dubai, UAE',
      'Palm Jumeirah, The Pointe, Dubai, UAE',
      'Dubai Healthcare City, Dubai, UAE',
    ],
  },
  mumbai: {
    depot: 'Gateway of India, Apollo Bandar, Colaba, Mumbai, India',
    deliveries: [
      'Chhatrapati Shivaji Terminus, Mumbai, India',
      'Marine Drive, Mumbai, India',
      'Haji Ali Dargah, Mumbai, India',
      'Siddhivinayak Temple, Prabhadevi, Mumbai, India',
      'Bandra-Worli Sea Link, Mumbai, India',
      'Juhu Beach, Mumbai, India',
      'Colaba Causeway, Mumbai, India',
      'Crawford Market, Mumbai, India',
      'Mahalaxmi Dhobi Ghat, Mumbai, India',
      'Powai Lake, Mumbai, India',
      'Phoenix Marketcity, Kurla, Mumbai, India',
      'R City Mall, Ghatkopar, Mumbai, India',
      'Inorbit Mall, Malad, Mumbai, India',
      'Phoenix Palladium, Lower Parel, Mumbai, India',
      'Bandra Kurla Complex, Mumbai, India',
      'Nariman Point, Mumbai, India',
      'Chhatrapati Shivaji Maharaj Vastu Sangrahalaya, Mumbai, India',
      'Sanjay Gandhi National Park, Borivali, Mumbai, India',
      'Film City, Goregaon, Mumbai, India',
      'Global Vipassana Pagoda, Mumbai, India',
      'Worli Sea Face, Mumbai, India',
      'Dadar Flower Market, Mumbai, India',
      'Hanging Gardens, Malabar Hill, Mumbai, India',
      'Kamala Nehru Park, Mumbai, India',
      'Nehru Science Centre, Worli, Mumbai, India',
      'Mahalakshmi Temple, Mumbai, India',
      'Bandra Bandstand, Mumbai, India',
      'Carter Road, Bandra West, Mumbai, India',
      'Linking Road, Bandra West, Mumbai, India',
      'Hill Road, Bandra West, Mumbai, India',
      'Oberoi Mall, Goregaon, Mumbai, India',
      'Infiniti Mall, Malad, Mumbai, India',
      'Hiranandani Gardens, Powai, Mumbai, India',
      'IIT Bombay, Powai, Mumbai, India',
      'Mumbai Central Station, Mumbai, India',
      'Andheri Station, Mumbai, India',
      'Borivali Station, Mumbai, India',
      'Juhu Tara Road, Juhu, Mumbai, India',
      'Mohammed Ali Road, Mumbai, India',
      'Lalbaug, Parel, Mumbai, India',
      'Dr E Moses Road, Worli, Mumbai, India',
      'Napean Sea Road, Mumbai, India',
      'Pedder Road, Mumbai, India',
      'Turner Road, Bandra West, Mumbai, India',
      'Waterfield Road, Bandra West, Mumbai, India',
      'Pali Hill, Bandra West, Mumbai, India',
      'EsselWorld, Gorai, Mumbai, India',
      'Seawoods Grand Central, Navi Mumbai, India',
      'Inorbit Mall, Vashi, Navi Mumbai, India',
    ],
  },
  'sao-paulo': {
    depot: 'MASP, Avenida Paulista, São Paulo, Brazil',
    deliveries: [
      'Ibirapuera Park, São Paulo, Brazil',
      'Mercado Municipal de São Paulo, Brazil',
      'São Paulo Cathedral, Sé, São Paulo, Brazil',
      'Theatro Municipal de São Paulo, Brazil',
      'Estação da Luz, São Paulo, Brazil',
      'Edifício Copan, São Paulo, Brazil',
      'Memorial da América Latina, São Paulo, Brazil',
      'Allianz Parque, São Paulo, Brazil',
      'Estádio do Morumbi, São Paulo, Brazil',
      'Arena Corinthians, São Paulo, Brazil',
      'Shopping Iguatemi São Paulo, Brazil',
      'Shopping Morumbi, São Paulo, Brazil',
      'Eldorado Shopping, São Paulo, Brazil',
      'JK Iguatemi, São Paulo, Brazil',
      'Parque Villa-Lobos, São Paulo, Brazil',
      'Pinacoteca de São Paulo, Brazil',
      'Liberdade, São Paulo, Brazil',
      'Beco do Batman, Vila Madalena, São Paulo, Brazil',
      'Expo Center Norte, São Paulo, Brazil',
      'Sambódromo do Anhembi, São Paulo, Brazil',
      'São Paulo Zoo, Brazil',
      'Autódromo de Interlagos, São Paulo, Brazil',
      'Vila Madalena, São Paulo, Brazil',
      'Mercado Municipal Pinheiros, São Paulo, Brazil',
      'Shopping Center Norte, São Paulo, Brazil',
      'Shopping Aricanduva, São Paulo, Brazil',
      'Shopping Anália Franco, São Paulo, Brazil',
      'Shopping Higienópolis, São Paulo, Brazil',
      'Shopping Pátio Paulista, São Paulo, Brazil',
      'Shopping Frei Caneca, São Paulo, Brazil',
      'Parque Ibirapuera Auditorium, São Paulo, Brazil',
      'Museu de Arte Contemporânea, São Paulo, Brazil',
      'Instituto Butantan, São Paulo, Brazil',
      'Hospital das Clínicas, São Paulo, Brazil',
      'Universidade de São Paulo, São Paulo, Brazil',
      'Parque do Piqueri, São Paulo, Brazil',
      'Parque da Água Branca, São Paulo, Brazil',
      'Parque Burle Marx, São Paulo, Brazil',
      'Parque Trianon, São Paulo, Brazil',
      'Mosteiro de São Bento, São Paulo, Brazil',
      'Pátio do Colégio, São Paulo, Brazil',
      'Mercado de Pinheiros, São Paulo, Brazil',
      'Rua Oscar Freire, São Paulo, Brazil',
      'Rua Augusta, São Paulo, Brazil',
      'Avenida Brigadeiro Faria Lima, São Paulo, Brazil',
      'Marginal Pinheiros, São Paulo, Brazil',
      'Estação Pinheiros, São Paulo, Brazil',
      'Estação Sé, São Paulo, Brazil',
    ],
  },
};

/** Extra landmarks used when primary seeds duplicate or fail geocoding. */
const REGION_BACKUPS = {
  london: [
    'Natural History Museum, London, UK',
    'Tate Modern, London, UK',
    "St Paul's Cathedral, London, UK",
    'Hyde Park, London, UK',
    'Covent Garden, London, UK',
    'Borough Market, London, UK',
    'Wembley Stadium, London, UK',
  ],
  paris: [
    'Notre-Dame de Paris, France',
    'Sacré-Cœur, Paris, France',
    'Musée d\'Orsay, Paris, France',
    'Panthéon, Paris, France',
    'Place de la Bastille, Paris, France',
  ],
  berlin: [
    'East Side Gallery, Berlin, Germany',
    'Potsdamer Platz, Berlin, Germany',
    'Alexanderplatz, Berlin, Germany',
  ],
  singapore: [
    'Raffles Hotel, Singapore',
    'Changi Airport Terminal 1, Singapore',
  ],
  dubai: [
    'Dubai International Airport, UAE',
    'Burj Al Arab, Dubai, UAE',
    'Dubai Creek Golf Club, Dubai, UAE',
    'Ibn Battuta Mall, Dubai, UAE',
    'Mirdif City Centre, Dubai, UAE',
    'Al Maktoum International Airport, Dubai, UAE',
  ],
  mumbai: [
    'Chhatrapati Shivaji Maharaj Terminus, Mumbai, India',
    'Bandra Terminus, Mumbai, India',
  ],
  tokyo: [
    'Tokyo Tower, 4-2-8 Shiba-Koen, Minato, Tokyo, Japan',
    'Tokyo Dome, 1-3-61 Koraku, Bunkyo, Tokyo, Japan',
    'Waseda University, 1-104 Totsukacho, Shinjuku, Tokyo, Japan',
  ],
  'sao-paulo': [
    'Pinheiros, São Paulo, Brazil',
    'Moema, São Paulo, Brazil',
    'Mercado Municipal, São Paulo, Brazil',
    'Theatro Municipal, São Paulo, Brazil',
    'Estação da Sé, São Paulo, Brazil',
    'Parque Ibirapuera, São Paulo, Brazil',
  ],
};

/** Metro bounding boxes — reject geocodes outside these (avoids US fallback coords). */
const REGION_BOUNDS = {
  seattle: { south: 47.4, north: 47.85, west: -122.5, east: -122.15 },
  'los-angeles': { south: 33.7, north: 34.25, west: -118.65, east: -118.05 },
  'new-york': { south: 40.55, north: 40.92, west: -74.05, east: -73.75 },
  london: { south: 51.35, north: 51.6, west: -0.45, east: 0.15 },
  paris: { south: 48.75, north: 48.95, west: 2.15, east: 2.55 },
  berlin: { south: 52.4, north: 52.65, west: 13.25, east: 13.55 },
  tokyo: { south: 35.55, north: 35.85, west: 139.55, east: 139.85 },
  sydney: { south: -34.05, north: -33.75, west: 150.95, east: 151.35 },
  toronto: { south: 43.55, north: 43.85, west: -79.55, east: -79.25 },
  singapore: { south: 1.22, north: 1.44, west: 103.65, east: 104.05 },
  dubai: { south: 24.85, north: 25.45, west: 54.95, east: 55.55 },
  mumbai: { south: 18.9, north: 19.28, west: 72.75, east: 73.05 },
  'sao-paulo': { south: -23.75, north: -23.45, west: -46.85, east: -46.45 },
};

function inBounds(lat, lng, bounds) {
  return lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east;
}

function isDuplicateCoord(lat, lng, placed) {
  const rLat = Number(lat.toFixed(5));
  const rLng = Number(lng.toFixed(5));
  return placed.some(
    (p) => Number(p.lat.toFixed(5)) === rLat && Number(p.lng.toFixed(5)) === rLng,
  );
}

const GEOCODE_QUALITY_RANK = {
  POINT: 0,
  ADDRESS: 1,
  STREET: 2,
  INTERSECTION: 3,
  POSTAL: 4,
  ZIP: 4,
  ZIP_EXTENDED: 4,
  NEIGHBORHOOD: 5,
  CITY: 6,
  COUNTY: 7,
  STATE: 8,
  COUNTRY: 9,
};

function isUsFallbackCoord(lat, lng) {
  return Math.abs(lat - 38.89037) < 0.02 && Math.abs(lng + 77.03196) < 0.02;
}

function pickGeocodeResult(address, locations, bounds) {
  let best = null;
  for (const loc of locations) {
    const lat = loc?.latLng?.lat;
    const lng = loc?.latLng?.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (isUsFallbackCoord(lat, lng)) continue;
    if (!inBounds(lat, lng, bounds)) continue;
    const quality = loc.geocodeQuality || 'COUNTRY';
    if (quality === 'COUNTRY') continue;
    const rank = GEOCODE_QUALITY_RANK[quality] ?? 5;
    if (!best || rank < best.rank) {
      best = { address, lat, lng, rank };
    }
  }
  return best ? { address, lat: best.lat, lng: best.lng } : null;
}

async function geocodeAddress(address, bounds) {
  const bb = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const url = `https://www.mapquestapi.com/geocoding/v1/address?key=${API_KEY}&location=${encodeURIComponent(address)}&maxResults=5&boundingBox=${bb}&thumbMaps=false`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const locations = data?.results?.[0]?.locations || [];
  return pickGeocodeResult(address, locations, bounds);
}

function durationForIndex(i) {
  if (i % 7 === 0) return 20;
  if (i % 3 === 0) return 15;
  return 10;
}

async function buildRegion(regionId, seed) {
  const bounds = REGION_BOUNDS[regionId];
  if (!bounds) throw new Error(`Missing bounds for ${regionId}`);

  const stops = [];
  const placed = [];
  console.log(`\n=== ${regionId} ===`);

  const depot = await geocodeAddress(seed.depot, bounds);
  if (!depot) throw new Error(`Failed to geocode depot: ${seed.depot}`);
  stops.push({ ...depot, address: seed.depot, duration: 0 });
  placed.push({ lat: depot.lat, lng: depot.lng });
  console.log('  depot OK');

  const candidates = [
    ...seed.deliveries,
    ...(seed.backups || []),
    ...(REGION_BACKUPS[regionId] || []),
  ];
  let ok = 0;
  for (let i = 0; i < candidates.length && stops.length < 50; i++) {
    const raw = candidates[i];
    const result = await geocodeAddress(raw, bounds);
    await new Promise((r) => setTimeout(r, 150));
    if (!result) {
      console.warn(`  skip: ${raw}`);
      continue;
    }
    if (isDuplicateCoord(result.lat, result.lng, placed)) {
      console.warn(`  skip (duplicate coords): ${raw}`);
      continue;
    }
    placed.push({ lat: result.lat, lng: result.lng });
    stops.push({
      address: raw,
      lat: Number(result.lat.toFixed(6)),
      lng: Number(result.lng.toFixed(6)),
      duration: durationForIndex(stops.length),
    });
    ok++;
    if (ok % 10 === 0) console.log(`  ${ok} deliveries geocoded`);
  }

  if (stops.length < 50) {
    throw new Error(`${regionId}: only ${stops.length} stops geocoded — add more seed addresses`);
  }

  return stops.slice(0, 50);
}

const regionFilter = process.env.REGIONS?.split(',').map((s) => s.trim()).filter(Boolean);
const outPath = path.join(root, 'lib/demo/fiftyStopDemosByRegion.ts');

let merged = {};
if (regionFilter?.length && fs.existsSync(outPath)) {
  const prev = fs.readFileSync(outPath, 'utf8');
  const m =
    prev.match(/=\s*(\{[\s\S]*?\n\})\s*;\s*(?:\n\nexport function getFiftyStopDemo|\s*$)/) ??
    prev.match(/FIFTY_STOP_DEMOS_BY_REGION[^=]*=\s*(\{[\s\S]*?\n\})\s*;/);
  if (m) {
    try {
      merged = JSON.parse(m[1]);
      console.log(`Merging with ${Object.keys(merged).length} existing regions`);
    } catch {
      console.warn('Could not parse existing fiftyStopDemosByRegion.ts — full regen');
    }
  }
}

const out = { ...merged };
for (const [regionId, seed] of Object.entries(SEEDS)) {
  if (regionFilter?.length && !regionFilter.includes(regionId)) continue;
  out[regionId] = await buildRegion(regionId, seed);
}

const ts = `// AUTO-GENERATED by scripts/generate-fifty-stop-demos.mjs — do not edit by hand
import type { MultiStopDemoSeed } from './multiStopDemoTypes';

export const FIFTY_STOP_DEMOS_BY_REGION: Record<string, MultiStopDemoSeed[]> = ${JSON.stringify(out, null, 2)};
`;

fs.writeFileSync(outPath, ts);
console.log(`\nWrote ${outPath} (${Object.keys(out).length} regions)`);
