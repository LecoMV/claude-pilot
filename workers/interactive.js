/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
/**
 * Interactive Worker - High-priority tasks
 *
 * Handles CPU-intensive operations that need quick response:
 * - Embedding generation
 * - Quick file analysis
 * - Real-time processing
 */

// Worker receives workerData from Piscina
const { workerData } = require('worker_threads')

/**
 * Main task handler
 * @param {object} task - Task to process
 * @returns {Promise<any>} Task result
 */
module.exports = async function handler(task) {
  const { type, data } = task

  switch (type) {
    case 'ping':
      return { pong: true, poolType: workerData?.poolType }

    case 'echo':
      return data

    default:
      throw new Error(`Unknown task type: ${type}`)
  }
}
