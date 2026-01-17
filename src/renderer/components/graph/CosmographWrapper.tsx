/**
 * Cosmograph Wrapper Component
 * High-performance WebGL graph visualization for large datasets
 * Feature: deploy-6elk
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, Maximize2, Filter, Download, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

// Graph data types
export interface GraphNode {
  id: string
  label?: string
  type?: string
  color?: string
  size?: number
  x?: number
  y?: number
  properties?: Record<string, unknown>
}

export interface GraphEdge {
  source: string
  target: string
  id?: string
  label?: string
  type?: string
  color?: string
  width?: number
  properties?: Record<string, unknown>
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface CosmographConfig {
  // Node appearance
  nodeSize: number
  nodeColor: string
  nodeGreyoutOpacity: number
  nodeLabels: boolean
  nodeLabelSize: number

  // Edge appearance
  edgeWidth: number
  edgeColor: string
  edgeGreyoutOpacity: number
  edgeCurvature: number
  edgeArrows: boolean

  // Layout
  simulation: boolean
  simulationGravity: number
  simulationRepulsion: number
  simulationLinkDistance: number
  simulationFriction: number

  // Interaction
  zoomSpeed: number
  enableDrag: boolean
  enableZoom: boolean
  enableHover: boolean
  enableClick: boolean

  // Performance
  renderLinks: boolean
  fitViewOnInit: boolean
  backgroundColor: string
}

export interface CosmographStats {
  nodeCount: number
  edgeCount: number
  fps: number
  renderTime: number
  selectedNodes: number
  hoveredNode: string | null
  zoomLevel: number
}

const DEFAULT_CONFIG: CosmographConfig = {
  nodeSize: 8,
  nodeColor: '#89b4fa',
  nodeGreyoutOpacity: 0.2,
  nodeLabels: true,
  nodeLabelSize: 12,

  edgeWidth: 1,
  edgeColor: '#6c7086',
  edgeGreyoutOpacity: 0.1,
  edgeCurvature: 0.25,
  edgeArrows: true,

  simulation: true,
  simulationGravity: 0.1,
  simulationRepulsion: 0.5,
  simulationLinkDistance: 50,
  simulationFriction: 0.9,

  zoomSpeed: 1,
  enableDrag: true,
  enableZoom: true,
  enableHover: true,
  enableClick: true,

  renderLinks: true,
  fitViewOnInit: true,
  backgroundColor: '#1e1e2e',
}

// Node type color mapping
const TYPE_COLORS: Record<string, string> = {
  // Code symbols
  function: '#a6e3a1', // Green
  class: '#89b4fa', // Blue
  interface: '#cba6f7', // Purple
  type: '#f9e2af', // Yellow
  variable: '#94e2d5', // Teal
  module: '#fab387', // Peach

  // Knowledge graph
  concept: '#89b4fa',
  entity: '#a6e3a1',
  relation: '#f9e2af',
  document: '#cba6f7',

  // Memory
  learning: '#a6e3a1',
  memory: '#89b4fa',
  checkpoint: '#f9e2af',

  // Default
  default: '#6c7086',
}

interface CosmographWrapperProps {
  data: GraphData
  config?: Partial<CosmographConfig>
  onNodeClick?: (node: GraphNode) => void
  onNodeHover?: (node: GraphNode | null) => void
  onEdgeClick?: (edge: GraphEdge) => void
  onSelectionChange?: (nodes: GraphNode[]) => void
  className?: string
  showControls?: boolean
  showStats?: boolean
}

export function CosmographWrapper({
  data,
  config: configOverrides,
  onNodeClick,
  onNodeHover,
  onEdgeClick: _onEdgeClick,
  onSelectionChange,
  className,
  showControls = true,
  showStats = true,
}: CosmographWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()

  const [config, setConfig] = useState<CosmographConfig>({ ...DEFAULT_CONFIG, ...configOverrides })
  const [stats, setStats] = useState<CosmographStats>({
    nodeCount: 0,
    edgeCount: 0,
    fps: 0,
    renderTime: 0,
    selectedNodes: 0,
    hoveredNode: null,
    zoomLevel: 1,
  })
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set())
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [filterType, setFilterType] = useState<string | null>(null)

  // Simulation state
  const simulationRef = useRef<{
    nodes: Array<GraphNode & { vx: number; vy: number; fx?: number; fy?: number }>
    edges: GraphEdge[]
    running: boolean
  }>({
    nodes: [],
    edges: [],
    running: false,
  })

  // Transform state (pan/zoom)
  const transformRef = useRef({ x: 0, y: 0, scale: 1 })
  // Reserved for future drag-to-move node feature
  const _dragRef = useRef<{ startX: number; startY: number; nodeId: string | null }>({
    startX: 0,
    startY: 0,
    nodeId: null,
  })

  // Color nodes based on type
  const coloredNodes = useMemo(() => {
    return data.nodes.map((node) => ({
      ...node,
      color: node.color || TYPE_COLORS[node.type || 'default'] || TYPE_COLORS.default,
      size: node.size || config.nodeSize,
    }))
  }, [data.nodes, config.nodeSize])

  // Filter nodes by type
  const filteredData = useMemo(() => {
    if (!filterType) return { nodes: coloredNodes, edges: data.edges }

    const filteredNodes = coloredNodes.filter((n) => n.type === filterType)
    const nodeIds = new Set(filteredNodes.map((n) => n.id))
    const filteredEdges = data.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    )

    return { nodes: filteredNodes, edges: filteredEdges }
  }, [coloredNodes, data.edges, filterType])

  // Get unique node types for filter dropdown
  const nodeTypes = useMemo(() => {
    const types = new Set(data.nodes.map((n) => n.type).filter(Boolean))
    return Array.from(types) as string[]
  }, [data.nodes])

  // Initialize simulation with force-directed layout
  const initSimulation = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const width = canvas.width
    const height = canvas.height

    // Initialize node positions randomly if not set
    simulationRef.current.nodes = filteredData.nodes.map((node) => ({
      ...node,
      x: node.x ?? Math.random() * width,
      y: node.y ?? Math.random() * height,
      vx: 0,
      vy: 0,
    }))

    simulationRef.current.edges = filteredData.edges
    simulationRef.current.running = config.simulation
  }, [filteredData, config.simulation])

  // Force simulation tick
  const simulationTick = useCallback(() => {
    const sim = simulationRef.current
    if (!sim.running || sim.nodes.length === 0) return

    const canvas = canvasRef.current
    if (!canvas) return

    const width = canvas.width
    const height = canvas.height
    const centerX = width / 2
    const centerY = height / 2

    // Build adjacency map for link forces
    const linkMap = new Map<string, string[]>()
    for (const edge of sim.edges) {
      if (!linkMap.has(edge.source)) linkMap.set(edge.source, [])
      if (!linkMap.has(edge.target)) linkMap.set(edge.target, [])
      linkMap.get(edge.source)!.push(edge.target)
      linkMap.get(edge.target)!.push(edge.source)
    }

    // Node map for quick lookup
    const nodeMap = new Map(sim.nodes.map((n) => [n.id, n]))

    // Apply forces
    for (const node of sim.nodes) {
      if (node.fx !== undefined && node.fy !== undefined) continue // Fixed position

      // Gravity towards center
      const dx = centerX - node.x!
      const dy = centerY - node.y!
      node.vx += dx * config.simulationGravity * 0.001
      node.vy += dy * config.simulationGravity * 0.001

      // Repulsion from other nodes
      for (const other of sim.nodes) {
        if (other.id === node.id) continue
        const rdx = node.x! - other.x!
        const rdy = node.y! - other.y!
        const dist = Math.sqrt(rdx * rdx + rdy * rdy) || 1
        const force = (config.simulationRepulsion * 1000) / (dist * dist)
        node.vx += (rdx / dist) * force
        node.vy += (rdy / dist) * force
      }

      // Link forces (attraction to connected nodes)
      const links = linkMap.get(node.id) || []
      for (const targetId of links) {
        const target = nodeMap.get(targetId)
        if (!target) continue
        const ldx = target.x! - node.x!
        const ldy = target.y! - node.y!
        const dist = Math.sqrt(ldx * ldx + ldy * ldy) || 1
        const targetDist = config.simulationLinkDistance
        const force = (dist - targetDist) * 0.01
        node.vx += (ldx / dist) * force
        node.vy += (ldy / dist) * force
      }

      // Apply friction
      node.vx *= config.simulationFriction
      node.vy *= config.simulationFriction

      // Update position
      node.x! += node.vx
      node.y! += node.vy

      // Boundary constraints
      node.x = Math.max(50, Math.min(width - 50, node.x!))
      node.y = Math.max(50, Math.min(height - 50, node.y!))
    }
  }, [config])

  // Render graph to canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const startTime = performance.now()
    const sim = simulationRef.current
    const transform = transformRef.current

    // Clear canvas
    ctx.fillStyle = config.backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Apply transform
    ctx.save()
    ctx.translate(transform.x, transform.y)
    ctx.scale(transform.scale, transform.scale)

    // Build node position map
    const nodeMap = new Map(sim.nodes.map((n) => [n.id, n]))

    // Draw edges
    if (config.renderLinks) {
      for (const edge of sim.edges) {
        const source = nodeMap.get(edge.source)
        const target = nodeMap.get(edge.target)
        if (!source || !target) continue

        const isHighlighted =
          selectedNodes.has(edge.source) ||
          selectedNodes.has(edge.target) ||
          hoveredNode === edge.source ||
          hoveredNode === edge.target

        ctx.beginPath()
        ctx.strokeStyle = isHighlighted
          ? edge.color || config.edgeColor
          : `${edge.color || config.edgeColor}${Math.round(config.edgeGreyoutOpacity * 255)
              .toString(16)
              .padStart(2, '0')}`
        ctx.lineWidth = (edge.width || config.edgeWidth) * (isHighlighted ? 2 : 1)

        // Draw curved or straight edge
        if (config.edgeCurvature > 0) {
          const midX = (source.x! + target.x!) / 2
          const midY = (source.y! + target.y!) / 2
          const dx = target.x! - source.x!
          const dy = target.y! - source.y!
          const perpX = -dy * config.edgeCurvature
          const perpY = dx * config.edgeCurvature
          ctx.moveTo(source.x!, source.y!)
          ctx.quadraticCurveTo(midX + perpX, midY + perpY, target.x!, target.y!)
        } else {
          ctx.moveTo(source.x!, source.y!)
          ctx.lineTo(target.x!, target.y!)
        }

        ctx.stroke()

        // Draw arrow
        if (config.edgeArrows) {
          const angle = Math.atan2(target.y! - source.y!, target.x! - source.x!)
          const arrowSize = 8
          const arrowX = target.x! - Math.cos(angle) * (target.size || config.nodeSize)
          const arrowY = target.y! - Math.sin(angle) * (target.size || config.nodeSize)

          ctx.beginPath()
          ctx.moveTo(arrowX, arrowY)
          ctx.lineTo(
            arrowX - arrowSize * Math.cos(angle - Math.PI / 6),
            arrowY - arrowSize * Math.sin(angle - Math.PI / 6)
          )
          ctx.lineTo(
            arrowX - arrowSize * Math.cos(angle + Math.PI / 6),
            arrowY - arrowSize * Math.sin(angle + Math.PI / 6)
          )
          ctx.closePath()
          ctx.fillStyle = isHighlighted
            ? edge.color || config.edgeColor
            : `${edge.color || config.edgeColor}80`
          ctx.fill()
        }
      }
    }

    // Draw nodes
    for (const node of sim.nodes) {
      const isSelected = selectedNodes.has(node.id)
      const isHovered = hoveredNode === node.id
      const isHighlighted = isSelected || isHovered

      // Node circle
      ctx.beginPath()
      ctx.arc(node.x!, node.y!, node.size || config.nodeSize, 0, Math.PI * 2)
      ctx.fillStyle = isHighlighted
        ? node.color || config.nodeColor
        : `${node.color || config.nodeColor}${Math.round(
            (isHighlighted ? 1 : config.nodeGreyoutOpacity) * 255
          )
            .toString(16)
            .padStart(2, '0')}`
      ctx.fill()

      // Selection/hover ring
      if (isSelected) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.stroke()
      } else if (isHovered) {
        ctx.strokeStyle = node.color || config.nodeColor
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Node label
      if (config.nodeLabels && node.label && (isHighlighted || transform.scale > 0.5)) {
        ctx.font = `${config.nodeLabelSize}px Inter, sans-serif`
        ctx.fillStyle = '#cdd6f4'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(
          node.label,
          node.x!,
          node.y! + (node.size || config.nodeSize) + 4
        )
      }
    }

    ctx.restore()

    const renderTime = performance.now() - startTime

    setStats((prev) => ({
      ...prev,
      nodeCount: sim.nodes.length,
      edgeCount: sim.edges.length,
      renderTime,
      selectedNodes: selectedNodes.size,
      hoveredNode,
      zoomLevel: transform.scale,
    }))
  }, [config, selectedNodes, hoveredNode])

  // Animation loop
  const animate = useCallback(() => {
    simulationTick()
    render()
    animationRef.current = requestAnimationFrame(animate)
  }, [simulationTick, render])

  // Handle resize
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const resize = () => {
      const rect = container.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
    }

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // Initialize and run simulation
  useEffect(() => {
    initSimulation()
    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [initSimulation, animate])

  // Update config when overrides change
  useEffect(() => {
    setConfig({ ...DEFAULT_CONFIG, ...configOverrides })
  }, [configOverrides])

  // Handle node click
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = (e.clientX - rect.left - transformRef.current.x) / transformRef.current.scale
      const y = (e.clientY - rect.top - transformRef.current.y) / transformRef.current.scale

      // Find clicked node
      for (const node of simulationRef.current.nodes) {
        const dx = x - node.x!
        const dy = y - node.y!
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist <= (node.size || config.nodeSize)) {
          // Toggle selection
          const newSelected = new Set(selectedNodes)
          if (e.ctrlKey || e.metaKey) {
            if (newSelected.has(node.id)) {
              newSelected.delete(node.id)
            } else {
              newSelected.add(node.id)
            }
          } else {
            newSelected.clear()
            newSelected.add(node.id)
          }
          setSelectedNodes(newSelected)

          if (onSelectionChange) {
            const selectedNodeData = simulationRef.current.nodes.filter((n) =>
              newSelected.has(n.id)
            )
            onSelectionChange(selectedNodeData)
          }

          if (onNodeClick) {
            onNodeClick(node)
          }
          return
        }
      }

      // Clicked on empty space - clear selection
      if (!e.ctrlKey && !e.metaKey) {
        setSelectedNodes(new Set())
        if (onSelectionChange) {
          onSelectionChange([])
        }
      }
    },
    [config.nodeSize, selectedNodes, onNodeClick, onSelectionChange]
  )

  // Handle mouse move (hover)
  const handleCanvasMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!config.enableHover) return

      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = (e.clientX - rect.left - transformRef.current.x) / transformRef.current.scale
      const y = (e.clientY - rect.top - transformRef.current.y) / transformRef.current.scale

      // Find hovered node
      let found: GraphNode | null = null
      for (const node of simulationRef.current.nodes) {
        const dx = x - node.x!
        const dy = y - node.y!
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist <= (node.size || config.nodeSize)) {
          found = node
          break
        }
      }

      if (found?.id !== hoveredNode) {
        setHoveredNode(found?.id || null)
        if (onNodeHover) {
          onNodeHover(found)
        }
      }
    },
    [config.enableHover, config.nodeSize, hoveredNode, onNodeHover]
  )

  // Handle wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (!config.enableZoom) return
      e.preventDefault()

      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
      const newScale = Math.max(0.1, Math.min(10, transformRef.current.scale * zoomFactor))

      // Zoom towards mouse position
      const dx = mouseX - transformRef.current.x
      const dy = mouseY - transformRef.current.y
      transformRef.current.x -= dx * (newScale / transformRef.current.scale - 1)
      transformRef.current.y -= dy * (newScale / transformRef.current.scale - 1)
      transformRef.current.scale = newScale
    },
    [config.enableZoom]
  )

  // Zoom controls
  const zoomIn = () => {
    transformRef.current.scale = Math.min(10, transformRef.current.scale * 1.2)
  }

  const zoomOut = () => {
    transformRef.current.scale = Math.max(0.1, transformRef.current.scale / 1.2)
  }

  const fitView = () => {
    const canvas = canvasRef.current
    if (!canvas || simulationRef.current.nodes.length === 0) return

    const nodes = simulationRef.current.nodes
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity

    for (const node of nodes) {
      minX = Math.min(minX, node.x!)
      minY = Math.min(minY, node.y!)
      maxX = Math.max(maxX, node.x!)
      maxY = Math.max(maxY, node.y!)
    }

    const padding = 50
    const width = maxX - minX + padding * 2
    const height = maxY - minY + padding * 2
    const scale = Math.min(canvas.width / width, canvas.height / height, 2)

    transformRef.current.scale = scale
    transformRef.current.x = (canvas.width - width * scale) / 2 - minX * scale + padding * scale
    transformRef.current.y = (canvas.height - height * scale) / 2 - minY * scale + padding * scale
  }

  // Export as PNG
  const exportPNG = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const link = document.createElement('a')
    link.download = 'graph.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  return (
    <div ref={containerRef} className={cn('relative w-full h-full', className)}>
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMove}
        onWheel={handleWheel}
      />

      {/* Controls */}
      {showControls && (
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <div className="flex gap-1 bg-surface/90 backdrop-blur rounded-lg p-1">
            <button onClick={zoomIn} className="p-2 hover:bg-border rounded" title="Zoom In">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={zoomOut} className="p-2 hover:bg-border rounded" title="Zoom Out">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button onClick={fitView} className="p-2 hover:bg-border rounded" title="Fit View">
              <Maximize2 className="w-4 h-4" />
            </button>
            <button onClick={exportPNG} className="p-2 hover:bg-border rounded" title="Export PNG">
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={cn('p-2 hover:bg-border rounded', showSettings && 'bg-border')}
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* Filter dropdown */}
          {nodeTypes.length > 0 && (
            <div className="flex items-center gap-2 bg-surface/90 backdrop-blur rounded-lg px-2 py-1">
              <Filter className="w-4 h-4 text-text-muted" />
              <select
                value={filterType || ''}
                onChange={(e) => setFilterType(e.target.value || null)}
                className="bg-transparent text-sm outline-none"
              >
                <option value="">All types</option>
                {nodeTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="absolute top-4 right-4 bg-surface/95 backdrop-blur rounded-lg p-4 w-64 space-y-3">
          <h3 className="font-medium text-sm">Graph Settings</h3>

          <label className="flex items-center justify-between text-sm">
            <span>Node Size</span>
            <input
              type="range"
              min="2"
              max="20"
              value={config.nodeSize}
              onChange={(e) => setConfig({ ...config, nodeSize: Number(e.target.value) })}
              className="w-20"
            />
          </label>

          <label className="flex items-center justify-between text-sm">
            <span>Edge Width</span>
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.5"
              value={config.edgeWidth}
              onChange={(e) => setConfig({ ...config, edgeWidth: Number(e.target.value) })}
              className="w-20"
            />
          </label>

          <label className="flex items-center justify-between text-sm">
            <span>Labels</span>
            <input
              type="checkbox"
              checked={config.nodeLabels}
              onChange={(e) => setConfig({ ...config, nodeLabels: e.target.checked })}
            />
          </label>

          <label className="flex items-center justify-between text-sm">
            <span>Arrows</span>
            <input
              type="checkbox"
              checked={config.edgeArrows}
              onChange={(e) => setConfig({ ...config, edgeArrows: e.target.checked })}
            />
          </label>

          <label className="flex items-center justify-between text-sm">
            <span>Simulation</span>
            <input
              type="checkbox"
              checked={config.simulation}
              onChange={(e) => {
                setConfig({ ...config, simulation: e.target.checked })
                simulationRef.current.running = e.target.checked
              }}
            />
          </label>
        </div>
      )}

      {/* Stats */}
      {showStats && (
        <div className="absolute bottom-4 left-4 bg-surface/90 backdrop-blur rounded-lg px-3 py-2 text-xs text-text-muted">
          <span>{stats.nodeCount} nodes</span>
          <span className="mx-2">|</span>
          <span>{stats.edgeCount} edges</span>
          <span className="mx-2">|</span>
          <span>{stats.renderTime.toFixed(1)}ms</span>
          <span className="mx-2">|</span>
          <span>{(stats.zoomLevel * 100).toFixed(0)}%</span>
          {stats.selectedNodes > 0 && (
            <>
              <span className="mx-2">|</span>
              <span className="text-accent-blue">{stats.selectedNodes} selected</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default CosmographWrapper
