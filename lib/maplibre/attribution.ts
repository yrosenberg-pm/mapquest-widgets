import type { Map } from 'maplibre-gl';

const TERMS_URL = 'https://www.mapquest.com/terms-of-use';

function mapQuestLogoSrc(darkMode: boolean) {
  return darkMode ? '/brand/mapquest-footer-dark.svg' : '/brand/mapquest-footer-light.svg';
}

/** MapQuest logo + terms — bottom-left / bottom-right, matching legacy Leaflet layout. */
export function layoutMapQuestAttribution(map: Map, darkMode: boolean) {
  const container = map.getContainer();
  if (darkMode) container.classList.add('dark-map');
  else container.classList.remove('dark-map');

  const bottomLeft =
    (container.querySelector('.maplibregl-ctrl-bottom-left') as HTMLElement | null) ?? container;

  let logo = container.querySelector('.mapquest-logo') as HTMLElement | null;
  if (!logo) {
    logo = document.createElement('div');
    logo.className = 'mapquest-logo';
    logo.setAttribute('aria-label', 'MapQuest');
    bottomLeft.appendChild(logo);
  } else if (logo.parentElement !== bottomLeft) {
    bottomLeft.appendChild(logo);
  }

  const logoSrc = mapQuestLogoSrc(darkMode);
  logo.innerHTML =
    `<a href="https://www.mapquest.com/" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">` +
    `<img src="${logoSrc}" alt="" width="117" height="20" decoding="async" />` +
    `</a>`;

  let terms = container.querySelector('a.mapquest-terms-docked') as HTMLAnchorElement | null;
  if (!terms) {
    terms = document.createElement('a');
    terms.id = 'terms';
    terms.className = 'mapquest-terms-docked termsLink';
    terms.href = TERMS_URL;
    terms.target = '_blank';
    terms.rel = 'noopener';
    terms.textContent = 'Terms';
    container.appendChild(terms);
  }

  logo.style.display = '';
  terms.style.display = '';
}
