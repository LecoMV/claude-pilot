/**
 * Streaming Services - Zero-Copy Data Transfer
 *
 * Exports the MessagePort streaming service for large file transfers
 * and binary data handling using Electron's MessageChannelMain.
 *
 * Part of the Hybrid IPC Architecture:
 * - Control Plane: tRPC for commands, state, config (<1KB)
 * - Data Plane: MessagePorts for large transfers (>1MB)
 *
 * @see docs/Research/Electron-tRPC Production Patterns Research.md
 */

export { messagePortStreamer } from './messageport'
export type { StreamConfig, StreamInfo, TransferResult } from './messageport'
