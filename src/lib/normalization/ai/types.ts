export type AiProviderConfig = {
  id: string;
  provider: string;
  model: string;
  max_tokens: number;
  temperature: number;
};

export type PromptTemplateRow = {
  id: string;
  code: string;
  label: string;
  system_prompt: string;
  user_prompt_template: string;
  ai_provider_config_id: string | null;
};

export type AiProposalDraft = {
  proposed_title: string;
  proposed_summary?: string | null;
  proposed_structured_data?: Record<string, unknown>;
  proposed_entity_alias?: string | null;
  confidence_score?: number;
  extraction_notes?: string | null;
  source_quote_refs?: { quote: string; context?: string }[];
};
