import type { GaugeBlockConfig } from "../../blocks/gauge";
import type { LovelaceCardConfig } from "../../shared/types";

export type GaugeCardConfig = LovelaceCardConfig & Partial<GaugeBlockConfig>;
