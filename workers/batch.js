/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
/**
 * Batch Worker - Background processing tasks
 *
 * Handles CPU-intensive batch operations:
 * - Bulk embedding generation
 * - Codebase indexing
 * - Large file processing
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
