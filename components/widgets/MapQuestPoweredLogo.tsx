'use client';

/**
 * Official MapQuest wordmark for widget footers.
 * Light theme: dark-on-light SVG. Dark theme: white wordmark SVG (no filter/chip).
 */
export default function MapQuestPoweredLogo({
  variant = 'footer',
  className = '',
  /** When true, use the white wordmark for dark backgrounds. */
  darkMode = false,
}: {
  variant?: 'footer' | 'inline';
  /** Extra classes on the wrapper span */
  className?: string;
  darkMode?: boolean;
}) {
  const wrapClass = [
    'prism-footer-mq-brand',
    variant === 'inline' ? 'prism-footer-mq-brand--inline' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const imgClass = [
    'prism-footer-logo',
    'prism-footer-logo--mq-official',
    variant === 'inline' ? 'prism-footer-logo--mq-official-inline' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const src = darkMode
    ? '/brand/mapquest-footer-dark.svg'
    : '/brand/mapquest-footer-light.svg';

  return (
    <span className={wrapClass}>
      <img
        src={src}
        alt="MapQuest"
        className={imgClass}
        decoding="async"
      />
    </span>
  );
}
