// Tipos de entidades según docs/API.md

export interface Paginated<T> {
  data: T[]
  links?: { first?: string | null; last?: string | null; prev?: string | null; next?: string | null }
  meta: { current_page: number; last_page: number; per_page: number; total: number; from?: number | null; to?: number | null }
}

export interface ApiResource<T> {
  data: T
}

export interface Role {
  id: number
  name: string
  permissions?: string[]
}

export interface UserScope {
  id?: number
  campus_id: number | null
  faculty_id: number | null
  career_id: number | null
  campus?: { name: string } | null
  faculty?: { name: string } | null
  career?: { name: string } | null
}

export interface User {
  uuid: string
  name: string
  email: string
  phone?: string | null
  status: 'active' | 'inactive'
  roles: string[] | Role[]
  permissions?: string[]
  scopes?: UserScope[]
  created_at?: string
}

export interface AuthUser {
  uuid: string
  name: string
  email: string
  phone?: string | null
  status?: string
  roles: string[]
  permissions: string[]
}

export interface Tag {
  id?: number
  name: string
  color?: string | null
}

// ——— Catálogos académicos ———

export interface Campus {
  id: number
  code: string
  name: string
}

export interface Career {
  id: number
  code: string
  name: string
  faculty_id: number
}

export interface Faculty {
  id: number
  code: string
  name: string
  careers: Career[]
}

export interface AcademicLevel {
  id: number
  code: string
  name: string
  category?: string
}

export interface PaymentSegmentDef {
  key: string
  label: string
}

export interface AcademicCatalogs {
  campuses: Campus[]
  faculties: Faculty[]
  levels: AcademicLevel[]
  modalities: string[]
  periods: string[]
  segments: PaymentSegmentDef[]
}

export type EnrollmentStatus = 'matriculado' | 'no_matriculado'

export interface Debt {
  uuid: string
  contact_uuid?: string
  contact?: Contact
  reference?: string | null
  code?: string | null
  concept?: string | null
  original_amount: number | string
  current_balance: number | string
  pending_balance?: number | string
  currency?: string
  due_date?: string | null
  academic_period?: string | null
  days_overdue?: number
  status: string
  installments_total?: number | null
  installments_paid?: number | null
  created_at?: string
  updated_at?: string
}

/** Referencia a un catálogo académico: el backend puede enviar objeto o solo el nombre. */
export type CatalogRef = { id?: number; name: string } | string | null

export interface Contact {
  uuid: string
  internal_code?: string | null
  first_name: string
  last_name?: string | null
  full_name?: string
  dni?: string | null
  phone?: string | null
  phone_secondary?: string | null
  email?: string | null
  city?: string | null
  address?: string | null
  status?: string
  source?: string | null
  segment?: string | null
  // Datos académicos
  id_persona?: string | number | null
  student_code?: string | null
  campus?: CatalogRef
  faculty?: CatalogRef
  career?: CatalogRef
  academic_level?: CatalogRef
  modality?: string | null
  enrollment_status?: EnrollmentStatus | string | null
  payment_segment?: string | null
  total_pending?: number | string | null
  call_consent?: boolean
  whatsapp_consent?: boolean
  do_not_contact?: boolean
  do_not_contact_reason?: string | null
  tags?: (Tag | string)[]
  debts?: Debt[]
  total_debt?: number | string
  created_at?: string
  updated_at?: string
}

export interface TimelineEvent {
  type: 'call' | 'agreement' | 'message' | 'follow_up' | 'note' | 'debt'
  at: string
  title: string
  description?: string | null
  meta?: Record<string, unknown>
}

export interface ContactNote {
  uuid?: string
  id?: number
  body: string
  user?: { name: string }
  created_at?: string
}

export interface ImportJob {
  uuid: string
  type: 'contacts' | 'debts'
  status: string
  file_name?: string | null
  headers?: string[]
  preview?: string[][]
  suggested_mapping?: Record<string, string>
  column_mapping?: Record<string, string>
  total_rows?: number
  processed_rows?: number
  created_count?: number
  updated_count?: number
  failed_count?: number
  duplicate_count?: number
  created_at?: string
}

export interface SegmentFilters {
  min_debt?: number | null
  max_debt?: number | null
  min_days_overdue?: number | null
  debt_status?: string[]
  city?: string[]
  segment?: string[]
  tags?: string[]
  consent_required?: boolean
  exclude_broken_agreements?: boolean
  max_attempts_lt?: number | null
  previous_campaign_uuid?: string | null
  previous_result?: string[]
  // Filtros académicos
  campus_id?: number[]
  faculty_id?: number[]
  career_id?: number[]
  academic_level_id?: number[]
  modality?: string[]
  enrollment_status?: string[]
  payment_segment?: string[]
  academic_period?: string[]
}

// ——— Panorama académico (dashboard) ———

export interface AcademicDashboardKpis {
  students_with_debt: number
  total_pending: number | string
  total_overdue: number | string
  avg_debt: number | string
}

export interface AcademicSegmentStat {
  segment: string
  label: string
  count: number
  amount: number | string
}

export interface AcademicGroupStat {
  name: string
  count: number
  amount: number | string
}

export interface AcademicCareerStat {
  name: string
  faculty: string
  count: number
  amount: number | string
}

export interface AcademicPeriodStat {
  period: string
  amount: number | string
}

export interface TopDebtor {
  uuid: string
  full_name: string
  career?: string | null
  campus?: string | null
  total_pending: number | string
  periods_count: number
  oldest_period?: string | null
  payment_segment?: string | null
}

export interface AcademicDashboard {
  kpis: AcademicDashboardKpis
  by_segment: AcademicSegmentStat[]
  by_campus: AcademicGroupStat[]
  by_faculty: AcademicGroupStat[]
  top_careers: AcademicCareerStat[]
  by_period: AcademicPeriodStat[]
  top_debtors: TopDebtor[]
}

export interface DtmfOption {
  action: 'confirm' | 'send_whatsapp' | 'transfer_advisor' | string
  template_uuid?: string
}

export interface DtmfOptions {
  [key: string]: DtmfOption | string | boolean | undefined
  repeat_key?: string
  record_response?: boolean
}

export type CampaignType = 'recorded_audio' | 'tts' | 'ai_conversational' | 'whatsapp'

export interface Campaign {
  uuid: string
  name: string
  description?: string | null
  type: CampaignType
  status: string
  priority?: string | number
  starts_at?: string | null
  ends_at?: string | null
  timezone?: string
  allowed_hours_start?: string | null
  allowed_hours_end?: string | null
  allowed_days?: number[] | string[]
  max_attempts?: number
  retry_delay_minutes?: number
  segment_filters?: SegmentFilters
  audio_url?: string | null
  dtmf_options?: DtmfOptions | null
  tts_message?: string | null
  prompt_uuid?: string | null
  prompt_version_uuid?: string | null
  ai_voice?: string | null
  ai_language?: string | null
  greeting_message?: string | null
  farewell_message?: string | null
  whatsapp_template_uuid?: string | null
  post_call_rules?: Record<string, unknown> | null
  budget_limit?: number | string | null
  total_contacts?: number
  progress?: CampaignProgress
  created_at?: string
  updated_at?: string
}

export interface CampaignProgress {
  total: number
  pending: number
  in_progress: number
  completed: number
  contacted: number
  failed: number
  answered_rate: number
  estimated_cost: number | string
}

export interface CampaignContact {
  uuid?: string
  contact: Contact
  attempts?: number
  status?: string
  result?: string | null
  last_attempt_at?: string | null
}

export interface SegmentPreview {
  count: number
  sample: Contact[]
}

export interface CallEvent {
  id?: number
  event?: string
  type?: string
  payload?: Record<string, unknown>
  at?: string
  created_at?: string
}

export interface CallRecording {
  uuid?: string
  id?: number
  duration?: number | null
  url?: string | null
  created_at?: string
}

export interface Call {
  uuid: string
  contact?: Contact
  campaign?: Campaign | null
  type: string
  direction?: string
  status: string
  result?: string | null
  duration?: number | null
  cost?: number | string | null
  from?: string | null
  to?: string | null
  answered_at?: string | null
  ended_at?: string | null
  events?: CallEvent[]
  recordings?: CallRecording[]
  transcription?: string | { text?: string; segments?: unknown[] } | null
  summary?: string | null
  structured_result?: Record<string, unknown> | null
  ai_session?: Record<string, unknown> | null
  created_at?: string
}

export interface FaqItem {
  q: string
  a: string
}

export interface PromptVersion {
  uuid?: string
  version?: number
  status?: string
  system_prompt?: string
  instructions?: string | null
  greeting_message?: string | null
  farewell_message?: string | null
  variables?: Record<string, string>
  enabled_tools?: string[]
  guardrails?: { forbidden_data?: string[]; security_rules?: string[] }
  faq?: FaqItem[]
  extraction_fields?: string[]
  max_duration_seconds?: number | null
  published_at?: string | null
  created_at?: string
}

export interface Prompt {
  uuid: string
  name: string
  description?: string | null
  status?: string
  current_version?: PromptVersion | null
  published_version?: PromptVersion | null
  versions?: PromptVersion[]
  created_at?: string
}

export interface SimulateResponse {
  session_uuid: string
  reply: string
  tool_calls: { name?: string; tool?: string; arguments?: Record<string, unknown> }[]
  finished: boolean
  structured_result?: Record<string, unknown> | null
}

export interface Agreement {
  uuid: string
  contact?: Contact
  debt?: Debt | null
  call_uuid?: string | null
  type?: string
  amount: number | string
  promise_date: string
  description?: string | null
  status: string
  observations?: string | null
  created_at?: string
}

export interface FollowUp {
  uuid: string
  contact?: Contact
  type?: string
  status: string
  priority?: string
  scheduled_at?: string | null
  due_at?: string | null
  assigned_to?: User | null
  title?: string | null
  notes?: string | null
  result?: string | null
  created_at?: string
}

export interface FollowUpRule {
  uuid: string
  name: string
  trigger_event: string
  action: string
  delay_minutes: number
  config?: Record<string, unknown> | null
  campaign_uuid?: string | null
  campaign?: Campaign | null
  active: boolean
}

export interface WhatsAppTemplate {
  uuid: string
  name: string
  language?: string
  category?: string
  status?: string
  body?: string
  variables?: string[]
  created_at?: string
}

export interface ContentTemplate {
  uuid: string
  name: string
  type: 'tts' | 'whatsapp_text'
  body: string
  created_at?: string
}

export interface Conversation {
  uuid: string
  contact?: Contact
  status: string
  priority?: string | null
  assigned_to?: User | null
  unread_count?: number
  last_message?: Message | null
  last_message_at?: string | null
  within_24h_window?: boolean
  window_expires_at?: string | null
  created_at?: string
}

export interface Message {
  uuid: string
  conversation_uuid?: string
  direction: 'inbound' | 'outbound'
  type?: string
  body?: string | null
  media_url?: string | null
  media_type?: string | null
  status?: string
  sent_at?: string | null
  delivered_at?: string | null
  read_at?: string | null
  created_at?: string
  user?: User | null
}

export interface DashboardKpis {
  total_contacts: number
  total_debt: number | string
  active_campaigns: number
  calls_scheduled: number
  calls_made: number
  calls_answered: number
  calls_missed: number
  agreements_total: number
  agreements_fulfilled: number
  agreements_broken: number
  whatsapp_sent: number
  whatsapp_replied: number
  pending_conversations: number
  estimated_cost: number | string
  contact_rate: number
  conversion_rate: number
  estimated_recovery: number | string
  [key: string]: number | string
}

export interface DashboardCharts {
  calls_by_day: { date: string; total?: number; answered?: number; [k: string]: unknown }[]
  results_by_campaign: { campaign?: string; name?: string; [k: string]: unknown }[]
  agreements_by_status: { status: string; total?: number; count?: number; [k: string]: unknown }[]
  messages_by_day: { date: string; sent?: number; received?: number; [k: string]: unknown }[]
  funnel: { stage?: string; label?: string; total?: number; count?: number; [k: string]: unknown }[]
  hourly_answer_rate: { hour: number | string; rate?: number; [k: string]: unknown }[]
}

export interface DashboardData {
  kpis: DashboardKpis
  charts: DashboardCharts
}

export interface AuditLog {
  uuid?: string
  id?: number
  user?: User | null
  module?: string
  action: string
  entity_type?: string | null
  entity_uuid?: string | null
  old_values?: Record<string, unknown> | null
  new_values?: Record<string, unknown> | null
  ip_address?: string | null
  created_at: string
}

export interface Integration {
  provider: string
  name?: string
  status: 'sandbox' | 'active' | string
  credentials?: Record<string, string>
  config?: Record<string, unknown>
  verified_at?: string | null
}

export interface Settings {
  [key: string]: string | number | boolean | null | undefined
}

export interface CostsSummary {
  total?: number | string
  by_type?: { type: string; total: number | string; count?: number }[]
  by_day?: { date: string; total: number | string }[]
  [k: string]: unknown
}

export interface PermissionGroup {
  module: string
  permissions: string[]
}

export interface ValidationError {
  message: string
  errors?: Record<string, string[]>
}
