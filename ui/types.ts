

export enum ServerStatus {
  STOPPED = 'stopped',
  RUNNING = 'running',
  ERROR = 'error',
}

export interface Server {
  id: string;
  remarks: string;
  status: ServerStatus;
}

export interface SubscriptionUserInfo {
  used_traffic: number;
  total: number | null;
  expire: string | null;
}

export interface Subscription {
  id: string;
  name: string;
  url: string;
  last_updated: string | null;
  server_count: number;
  user_info: SubscriptionUserInfo | null;
}

export interface SubscriptionDetail extends Subscription {
  servers: Server[];
}

export interface AllocatedPort {
  port: number;
  protocol: string;
  tag: string;
}

export interface ServerStatusResponse {
  message: string;
  server_id: string | null;
  status: ServerStatus;
  remarks: string | null;
  process_id?: number | null;
  start_time?: string | null;
  allocated_ports?: AllocatedPort[] | null;
}

export interface SubscriptionCreate {
  name: string;
  url: string;
}

export interface SubscriptionUpdate {
  name?: string | null;
  url?: string | null;
}

export interface ServerTestResult {
  server_id: string;
  remarks: string;
  success: boolean;
  ping_ms: number | null;
  error: string | null;
  socks_port: number;
  http_port: number;
}

export interface SubscriptionUrlTestResponse {
  message: string;
  subscription_id: string;
  subscription_name: string;
  total_servers: number;
  successful_tests: number;
  failed_tests: number;
  results: ServerTestResult[];
}

export interface RoutingRule {
  id: string;
  name?: string | null;
  action: 'bypass' | 'proxy' | 'block' | 'warp';
  domain: string[];
  ip: string[];
  port?: string | null;
  protocol: string[];
  process: string[];
  enabled: boolean;
}

export type TunRouting = 'ipv4_ipv6' | 'ipv4' | 'ipv6';

export interface WarpAccount {
  device_id: string;
  access_token: string;
  private_key: string;
  license_key?: string;
  account_type?: string;
  warped?: boolean | null;
  warp_plus?: boolean | null;
}

export interface WarpProfile {
  private_key: string;
  address_v4: string;
  address_v6: string;
  peer_public_key: string;
  endpoint: string;
  dns?: string[];
  mtu?: number;
  allowed_ips?: string[];
}

export interface WarpStatusResponse {
  success: boolean;
  enabled: boolean;
  has_account: boolean;
  has_profile: boolean;
  account?: WarpAccount | null;
  profile?: WarpProfile | null;
  message?: string;
}

export interface SettingsResponse {
  socks_port: number | null;
  http_port: number | null;
  xray_binary: string | null;
  xray_assets_folder: string | null;
  xray_log_level: string | null;
  system_proxy: boolean;
  tun_mode: boolean;
  tun_routing: TunRouting;
  dns_hijack: boolean;
  routing_rules: RoutingRule[];
  warp_enabled?: boolean;
  warp_route_all?: boolean;
  warp_has_account?: boolean;
  warp_has_profile?: boolean;
  warp_account?: WarpAccount | null;
  warp_profile?: WarpProfile | null;
}

export interface SettingsUpdate {
  socks_port?: number | null;
  http_port?: number | null;
  xray_binary?: string | null;
  xray_assets_folder?: string | null;
  xray_log_level?: string | null;
  system_proxy?: boolean;
  tun_mode?: boolean;
  tun_routing?: TunRouting;
  dns_hijack?: boolean;
  routing_rules?: RoutingRule[];
  warp_enabled?: boolean;
  warp_route_all?: boolean;
}

export interface SystemInfo {
  available: boolean;
  version: string | null;
  commit: string | null;
  go_version: string | null;
  arch: string | null;
}

export interface XrayAssetInfo {
    version: string;
    size_bytes: number | null;
    prerelease?: boolean;
}

export interface XrayVersionInfo {
    current_version: string | null;
    latest_version: string;
    available_versions: XrayAssetInfo[];
}

export interface XrayUpdateRequest {
    version?: string | null;
}

export interface XrayUpdateResponse {
    message: string;
    version: string;
    current_version: string | null;
}

export interface GeodataUpdateResponse {
    message: string;
    updated_files: Record<string, boolean>;
    assets_folder: string;
}

export interface SubscriptionCreateResponse {
  message: string;
  id: string;
  name: string;
  server_count: number;
}

export interface SubscriptionUpdateResponse {
  message: string;
  id: string;
  name: string;
}

export interface SubscriptionDeleteResponse {
  message: string;
  id: string;
  name: string;
}

export interface SubscriptionRefreshResponse {
  message: string;
  id: string;
  server_count: number;
  last_updated: string | null;
}

export interface ServerStartResponse {
  message: string;
  server_id: string;
  status: 'running';
  remarks: string;
}

export interface ApiErrorData {
  requires_xray_update?: boolean;
  required_version?: string;
  current_version?: string | null;
}

export interface ServerStopResponse {
  message: string;
  server_id: string | null;
  status: 'stopped';
}

export interface SettingsUpdateResponse extends SettingsResponse {
  message: string;
}

export interface LogEntry {
  timestamp: string; // ISO datetime
  message: string;
}

export interface LogSnapshotResponse {
  message: string;
  server_id: string | null;
  logs: LogEntry[];
}

export interface LogStreamBatchResponse {
  message:string;
  server_id: string | null;
  logs: LogEntry[];
  next_since_ms: number | null;
}

export interface AppearanceResponse {
  theme: string | null;
  font: string | null;
}

export interface AppearanceUpdate {
  theme?: string | null;
  font?: string | null;
}

export interface AppearanceUpdateResponse extends AppearanceResponse {
  message: string;
}

export interface GetServerJsonResponse {
  success: boolean;
  server_id: string;
  subscription_id: string;
  remarks: string;
  json_config: string;
}

export interface RestartResult {
  success: boolean;
  message: string;
  server_id: string;
  subscription_id: string;
  remarks: string;
  was_running: boolean;
  action: 'restarted' | 'no_action';
}

export interface UpdateServerJsonResponse {
  success: boolean;
  message: string;
  server_id: string;
  subscription_id: string;
  remarks: string;
  restart_result: RestartResult;
}
