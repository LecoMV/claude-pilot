/**
 * Worker Pool Services - Piscina-based Thread Management
 *
 * Exports the worker pool service for CPU-intensive operations
 * using Piscina worker pools with SharedArrayBuffer support.
 *
 * Pool Types:
 * - Interactive: 2 high-priority threads for responsive operations
 * - Background: Remaining cores for batch processing
 *
 * @see docs/Research/Electron Worker Thread Optimization Strategies.md
 */

export { workerPool } from './pool'
export type { PoolConfig, TaskResult, PoolStats } from './pool'
