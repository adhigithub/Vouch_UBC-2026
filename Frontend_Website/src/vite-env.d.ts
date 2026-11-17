/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_USE_MOCK_DATA?: string;
  readonly VITE_VOUCH_API_BASE_URL?: string;
  readonly VITE_SOLANA_RPC_URL?: string;
  readonly VITE_FAKE_API_BASE_URL?: string;
}
