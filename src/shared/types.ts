export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HassLocale {
  language: string;
  number_format?: string;
  time_format?: string;
  time_zone?: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  language: string;
  locale: HassLocale;
  config: { time_zone: string };
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ): Promise<unknown>;
  formatEntityState?(stateObj: HassEntity, state?: string): string;
  callWS<T = unknown>(message: Record<string, unknown>): Promise<T>;
}

export interface LovelaceCardConfig {
  type: string;
  [key: string]: unknown;
}

export interface HaFormSchema {
  name: string;
  type?: "expandable";
  flatten?: boolean;
  title?: string;
  required?: boolean;
  selector?: Record<string, unknown>;
  schema?: HaFormSchema[];
}
