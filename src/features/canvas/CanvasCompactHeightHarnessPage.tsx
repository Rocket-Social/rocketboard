import type {PointerEventHandler, WheelEventHandler} from 'react'
import {useRef, useState} from 'react'

import {CanvasSurface} from './CanvasSurface'
import {CanvasToolbar} from './CanvasToolbar'
import {
  CANVAS_DRAWING_COLORS,
  CANVAS_NOTE_COLORS,
  DEFAULT_CANVAS_SHAPE_FILL_COLOR,
  DEFAULT_CANVAS_SHAPE_TYPE,
  DEFAULT_CANVAS_VIEWPORT,
  type CanvasToolMode,
} from './canvas.types'

const noopPointerHandler: PointerEventHandler<HTMLDivElement> = () => {}
const noopWheelHandler: WheelEventHandler<HTMLDivElement> = () => {}

export function CanvasCompactHeightHarnessPage() {
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const [activeTool, setActiveTool] = useState<CanvasToolMode>('select')
  const [noteColor, setNoteColor] = useState<string>(CANVAS_NOTE_COLORS[0])
  const [penColor, setPenColor] = useState<string>(CANVAS_DRAWING_COLORS[0])
  const [penWidth, setPenWidth] = useState(2)

  return (
    <div className='h-screen overflow-hidden bg-canvas p-0'>
      <div
        className='relative h-full min-h-[min(640px,100%)] w-full overflow-hidden rounded-[24px] border border-border-subtle bg-canvas shadow-panel'
        data-testid='canvas-compact-frame'
      >
        <CanvasSurface
          canEdit
          empty={false}
          isDragActive={false}
          isLoading={false}
          onPointerCancel={noopPointerHandler}
          onPointerDown={noopPointerHandler}
          onPointerMove={noopPointerHandler}
          onPointerUp={noopPointerHandler}
          onWheel={noopWheelHandler}
          surfaceRef={surfaceRef}
          viewport={DEFAULT_CANVAS_VIEWPORT}
        >
          <div className='absolute left-[220px] top-[140px] h-20 w-56 rounded-[10px] border border-border-subtle bg-surface-elevated'/>
        </CanvasSurface>

        <CanvasToolbar
          activeTool={activeTool}
          canEdit
          noteColor={noteColor}
          onNoteColorChange={setNoteColor}
          onPenColorChange={setPenColor}
          onPenWidthChange={setPenWidth}
          onSelectTool={setActiveTool}
          onShapeFillColorChange={() => {}}
          onShapeTypeChange={() => {}}
          penColor={penColor}
          penWidth={penWidth}
          shapeFillColor={DEFAULT_CANVAS_SHAPE_FILL_COLOR}
          shapeType={DEFAULT_CANVAS_SHAPE_TYPE}
        />
      </div>
    </div>
  )
}
