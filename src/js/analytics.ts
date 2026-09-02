import { GA_MEASUREMENT_ID } from '../config';

declare global {
  interface Window {
    dataLayer: unknown[];
  }
}

// Підключає gtag.js як зовнішній <script> (дозволений в CSP через googletagmanager.com),
// а сам виклик gtag() лежить у нашому self-хостнутому бандлі — так inline-скрипт CSP не потрібен.
export function initAnalytics(): void {
  if (!GA_MEASUREMENT_ID) return;

  window.dataLayer = window.dataLayer || [];
  function gtag(...args: unknown[]): void {
    window.dataLayer.push(args);
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID);
}
