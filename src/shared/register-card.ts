interface CustomCardInfo {
  type: string;
  name: string;
  description?: string;
  preview?: boolean;
}

declare global {
  interface Window {
    customCards?: CustomCardInfo[];
  }
}

export function registerCard(info: CustomCardInfo): void {
  window.customCards ??= [];
  if (!window.customCards.some((c) => c.type === info.type)) window.customCards.push(info);
}
