type TelegramApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
};

declare global {
  interface Window { Telegram?: { WebApp?: TelegramApp } }
}

export function initializeTelegram() {
  const app = window.Telegram?.WebApp;
  app?.ready();
  app?.expand();
  // Не используем initDataUnsafe как доказательство личности.
  return app?.initData || '';
}
