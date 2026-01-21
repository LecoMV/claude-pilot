import { useCallback, useEffect, useRef, useState } from 'react'
import cytoscape, { Core, ElementDefinition } from 'cytoscape'
import { RefreshCw, ZoomIn, ZoomOut, Maximize2, Home, Play } from 'lucide-react'
import { trpc } from '@/lib/trpc/react'

interface GraphNode {
  id: string
  label: string
  type: string
  properties: Record<string, unknown>
}

interface GraphEdge {
  id: string
  source: string
  target: string
  type: string
  properties: Record<string, unknown>
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// Color palette for different node types
const nodeColors: Record<string, string> = {
  Technique: '#cba6f7', // Purple
  CVE: '#f38ba8', // Red
  Tool: '#89b4fa', // Blue
  Target: '#a6e3a1', // Green
  Attack: '#f9e2af', // Yellow
  Defense: '#94e2d5', // Teal
  Unknown: '#6c7086', // Gray
}

const getNodeColor = (type: string): string => {
  return nodeColors[type] || nodeColors.Unknown
}

export function GraphViewer() {
  // tRPC hooks
  const utils = trpc.useUtils()

  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [query, setQuery] = useState('')
  const [nodeLimit, setNodeLimit] = useState(500)

  // Load graph data from backend
  const loadGraph = useCallback(
    async (cypherQuery?: string) => {
      setLoading(true)
      setError(null)
      try {
        const result = await utils.memory.graph.fetch({ query: cypherQuery, limit: nodeLimit })
        setGraphData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load graph')
      } finally {
        setLoading(false)
      }
    },
    [utils, nodeLimit]
  )

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return

    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            label: 'data(label)',
            color: '#cdd6f4',
            'text-valign': 'bottom',
            'text-margin-y': 5,
            'font-size': '10px',
            'text-max-width': '80px',
            'text-wrap': 'ellipsis',
            width: 30,
            height: 30,
            'border-width': 2,
            'border-color': '#3d3d5c',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#cba6f7',
            'background-color': '#cba6f7',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': '#3d3d5c',
            'target-arrow-color': '#6c7086',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(type)',
            color: '#6c7086',
            'font-size': '8px',
            'text-rotation': 'autorotate',
            'text-margin-y': -8,
          },
        },
        {
          selector: 'edge:selected',
          style: {
            'line-color': '#cba6f7',
            'target-arrow-color': '#cba6f7',
          },
        },
      ],
      layout: { name: 'grid' },
      wheelSensitivity: 0.3,
      minZoom: 0.1,
      maxZoom: 3,
    })

    // Click handler for nodes
    cy.on('tap', 'node', (evt) => {
      const node = evt.target
      const nodeData = node.data()
      setSelectedNode({
        id: nodeData.id,
        label: nodeData.label,
        type: nodeData.type,
        properties: nodeData.properties || {},
      })
    })

    // Click on background to deselect
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setSelectedNode(null)
      }
    })

    cyRef.current = cy

    return () => {
      cy.destroy()
    }
  }, [])

  // Update graph when data changes
  useEffect(() => {
    if (!cyRef.current || !graphData) return

    const cy = cyRef.current
    cy.elements().remove()

    if (graphData.nodes.length === 0) return

    // Create elements
    const elements: ElementDefinition[] = []

    // Add nodes
    for (const node of graphData.nodes) {
      elements.push({
        data: {
          id: node.id,
          label: node.label.slice(0, 20) + (node.label.length > 20 ? '...' : ''),
          type: node.type,
          color: getNodeColor(node.type),
          properties: node.properties,
        },
      })
    }

    // Add edges
    for (const edge of graphData.edges) {
      elements.push({
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type,
        },
      })
    }

    cy.add(elements)

    // Apply layout
    cy.layout({
      name: 'cose',
      animate: true,
      animationDuration: 500,
      nodeRepulsion: () => 8000,
      idealEdgeLength: () => 100,
      gravity: 0.25,
    }).run()
  }, [graphData])

  // Load initial graph
  useEffect(() => {
    loadGraph()
  }, [loadGraph])

  const handleZoomIn = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 1.2)
    }
  }

  const handleZoomOut = () => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() / 1.2)
    }
  }

  const handleFit = () => {
    if (cyRef.current) {
      cyRef.current.fit(undefined, 50)
    }
  }

  const handleCenter = () => {
    if (cyRef.current) {
      cyRef.current.center()
    }
  }

  const handleRunQuery = () => {
    if (query.trim()) {
      loadGraph(query)
    } else {
      loadGraph()
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Query input */}
      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          placeholder="Enter Cypher query or leave empty for sample..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleRunQuery()}
          className="input flex-1 font-mono text-sm"
        />
        <select
          value={nodeLimit}
          onChange={(e) => setNodeLimit(Number(e.target.value))}
          className="input w-28 text-sm"
          title="Max nodes to display"
        >
          <option value={100}>100 nodes</option>
          <option value={500}>500 nodes</option>
          <option value={1000}>1K nodes</option>
          <option value={2000}>2K nodes</option>
          <option value={5000}>5K nodes</option>
        </select>
        <button onClick={handleRunQuery} disabled={loading} className="btn btn-primary">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomIn}
            className="btn btn-icon"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            onClick={handleZoomOut}
            className="btn btn-icon"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            onClick={handleFit}
            className="btn btn-icon"
            title="Fit to view"
            aria-label="Fit to view"
          >
            <Maximize2 className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            onClick={handleCenter}
            className="btn btn-icon"
            title="Center"
            aria-label="Center"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="text-xs text-text-muted">
          {graphData && (
            <span>
              Showing {graphData.nodes.length} nodes, {graphData.edges.length} edges
              {graphData.nodes.length >= nodeLimit && (
                <span className="text-accent-yellow ml-2">
                  (limit reached - increase to see more)
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Graph container */}
      <div className="flex-1 relative border border-border rounded-lg overflow-hidden bg-background">
        <div ref={containerRef} className="absolute inset-0" />

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <RefreshCw className="w-8 h-8 animate-spin text-accent-purple" />
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center p-4">
              <p className="text-accent-red mb-2">{error}</p>
              <button onClick={() => loadGraph()} className="btn btn-secondary">
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && graphData && graphData.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-text-muted">
            <p>No graph data available. Try running a Cypher query.</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 flex-wrap">
        {Object.entries(nodeColors)
          .filter(([k]) => k !== 'Unknown')
          .map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-text-muted">{type}</span>
            </div>
          ))}
      </div>

      {/* Selected node details */}
      {selectedNode && (
        <div className="mt-3 p-3 border border-border rounded-lg bg-surface">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-text-primary">{selectedNode.label}</h4>
            <span
              className="px-2 py-0.5 text-xs rounded"
              style={{
                backgroundColor: getNodeColor(selectedNode.type) + '20',
                color: getNodeColor(selectedNode.type),
              }}
            >
              {selectedNode.type}
            </span>
          </div>
          <div className="text-xs text-text-muted space-y-1">
            <p>ID: {selectedNode.id}</p>
            {Object.entries(selectedNode.properties)
              .slice(0, 5)
              .map(([key, value]) => (
                <p key={key} className="truncate">
                  <span className="text-text-secondary">{key}:</span> {String(value).slice(0, 100)}
                </p>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
