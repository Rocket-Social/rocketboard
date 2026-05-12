/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {CanvasDrawingLayer} from './CanvasDrawingLayer'
import {
  CANVAS_ALIGNMENT_GUIDE_COLOR,
  CANVAS_SIZE_GUIDE_COLOR,
  CANVAS_SPACING_GUIDE_COLOR,
  DEFAULT_CANVAS_SHAPE_FILL_COLOR,
  type CanvasElement,
  type CanvasShapeType,
} from './canvas.types'

const shapeElement: CanvasElement = {
  assetPath: null,
  content: 'Shape',
  createdAt: '2026-04-21T00:00:00.000Z',
  createdBy: 'user-1',
  elementType: 'shape',
  height: 180,
  id: 'shape-1',
  isResolved: false,
  pathData: null,
  projectViewId: 'view-1',
  style: {
    fill_color: '#f2eee6',
    shape_type: 'circle',
    stroke_color: '#17202b',
    stroke_opacity: 1,
    stroke_style: 'solid',
    stroke_width: 2,
    text_align: 'left',
    text_family: 'standard',
    text_size: 16,
  },
  updatedAt: '2026-04-21T00:00:00.000Z',
  url: null,
  width: 180,
  x: 120,
  y: 80,
  zIndex: 3,
}

describe('CanvasDrawingLayer', () => {
  it('renders the added shape types on the canvas with shape-aware text bounds', () => {
    const px = (value: number) => `${value}px`
    const shapeTextBoundsByType: Array<{
      expected: {bottom: string; left: string; right: string; top: string}
      shapeType: CanvasShapeType
    }> = [
      {
        expected: {bottom: px(180 * 0.36), left: px(180 * 0.36), right: px(180 * 0.36), top: px(180 * 0.36)},
        shapeType: 'plus',
      },
      {
        expected: {bottom: px(180 * 0.26), left: px(180 * 0.24), right: px(180 * 0.24), top: px(180 * 0.28)},
        shapeType: 'star',
      },
      {
        expected: {bottom: px(180 * 0.34), left: px(180 * 0.14), right: px(180 * 0.14), top: px(180 * 0.18)},
        shapeType: 'thought-bubble',
      },
    ]

    shapeTextBoundsByType.forEach(({expected, shapeType}) => {
      const {container, unmount} = render(
        <CanvasDrawingLayer
          canEdit
          editingElementId={null}
          elements={[{
            ...shapeElement,
            id: `shape-${shapeType}`,
            style: {
              ...shapeElement.style,
              shape_type: shapeType,
            },
          }]}
          onElementPointerDown={vi.fn()}
          onResizeHandlePointerDown={vi.fn()}
          onShapeClick={vi.fn()}
          onShapeEditorEscape={vi.fn()}
          onShapeEditorReady={vi.fn()}
          onShapeTextDraftChange={vi.fn()}
          previewDrawing={null}
          previewShape={null}
          selectedElementId={null}
          shapeEditingStyleDraft={null}
          shapeTextFocusRequest={null}
          shapeTextDraft={null}
          showShapeSelectionHandles
          transformPreview={null}
        />,
      )

      expect(container.querySelector('svg > *')).toBeInTheDocument()
      expect(screen.getByTestId('canvas-shape-text-bounds')).toHaveStyle(expected)
      unmount()
    })
  })

  it('shows interactive border and corner resize handles for the selected shape', () => {
    const onElementPointerDown = vi.fn()
    const onResizeHandlePointerDown = vi.fn()
    const {container} = render(
      <CanvasDrawingLayer
        canEdit
        editingElementId={null}
        elements={[shapeElement]}
        onElementPointerDown={onElementPointerDown}
        onResizeHandlePointerDown={onResizeHandlePointerDown}
        onShapeClick={vi.fn()}
        onShapeEditorEscape={vi.fn()}
        onShapeEditorReady={vi.fn()}
        onShapeTextDraftChange={vi.fn()}
        previewDrawing={null}
        previewShape={null}
        selectedElementId={shapeElement.id}
        shapeEditingStyleDraft={null}
        shapeTextFocusRequest={null}
        shapeTextDraft={null}
        showShapeSelectionHandles
        transformPreview={null}
      />,
    )

    expect(screen.getByTestId('canvas-selection-frame')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-selection-handle-top')).toHaveClass('cursor-ns-resize')
    expect(screen.getByTestId('canvas-selection-handle-right')).toHaveClass('cursor-ew-resize')
    expect(screen.getByTestId('canvas-selection-handle-bottom')).toHaveClass('cursor-ns-resize')
    expect(screen.getByTestId('canvas-selection-handle-left')).toHaveClass('cursor-ew-resize')
    expect(screen.getByTestId('canvas-selection-handle-top-left')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-selection-handle-top-right')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-selection-handle-bottom-left')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-selection-handle-bottom-right')).toBeInTheDocument()

    const shapeSvg = container.querySelector('svg')
    expect(shapeSvg).not.toBeNull()

    fireEvent.pointerDown(shapeSvg!)
    expect(onElementPointerDown).toHaveBeenCalledTimes(1)

    fireEvent.pointerDown(screen.getByTestId('canvas-selection-handle-top-left'))
    expect(onResizeHandlePointerDown).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(screen.getByTestId('canvas-selection-handle-right'))
    expect(onResizeHandlePointerDown).toHaveBeenCalledTimes(2)
  })

  it('renders the selected shape frame above higher-z elements', () => {
    const overlappingShape: CanvasElement = {
      ...shapeElement,
      id: 'shape-2',
      x: 160,
      zIndex: 9,
    }

    render(
      <CanvasDrawingLayer
        canEdit
        editingElementId={null}
        elements={[shapeElement, overlappingShape]}
        onElementPointerDown={vi.fn()}
        onResizeHandlePointerDown={vi.fn()}
        onShapeClick={vi.fn()}
        onShapeEditorEscape={vi.fn()}
        onShapeEditorReady={vi.fn()}
        onShapeTextDraftChange={vi.fn()}
        previewDrawing={null}
        previewShape={null}
        selectedElementId={shapeElement.id}
        shapeEditingStyleDraft={null}
        shapeTextFocusRequest={null}
        shapeTextDraft={null}
        showShapeSelectionHandles
        transformPreview={null}
      />,
    )

    expect(screen.getByTestId('canvas-selection-frame')).toHaveStyle({zIndex: '10'})
  })

  it('renders selection frames without resize handles for multiple selected shapes', () => {
    const secondShape: CanvasElement = {
      ...shapeElement,
      id: 'shape-2',
      x: 360,
      y: 320,
      zIndex: 4,
    }

    render(
      <CanvasDrawingLayer
        canEdit
        editingElementId={null}
        elements={[shapeElement, secondShape]}
        onElementPointerDown={vi.fn()}
        onResizeHandlePointerDown={vi.fn()}
        onShapeClick={vi.fn()}
        onShapeEditorEscape={vi.fn()}
        onShapeEditorReady={vi.fn()}
        onShapeTextDraftChange={vi.fn()}
        previewDrawing={null}
        previewShape={null}
        selectedElementId={null}
        selectedElementIds={[shapeElement.id, secondShape.id]}
        shapeEditingStyleDraft={null}
        shapeTextFocusRequest={null}
        shapeTextDraft={null}
        showShapeSelectionHandles
        transformPreview={null}
      />,
    )

    expect(screen.getAllByTestId('canvas-selection-frame')).toHaveLength(2)
    expect(screen.getByTestId('canvas-selection-group-frame')).toHaveStyle({
      height: '420px',
      left: '120px',
      top: '80px',
      width: '420px',
      zIndex: '5',
    })
    expect(screen.getByTestId('canvas-selection-group-frame').firstElementChild).toHaveAttribute(
      'style',
      expect.stringContaining('--color-canvas-selection'),
    )
    expect(screen.getByTestId('canvas-selection-corner-top-left')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-selection-corner-top-right')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-selection-corner-bottom-left')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-selection-corner-bottom-right')).toBeInTheDocument()
    expect(screen.queryByTestId('canvas-selection-handle-top-left')).not.toBeInTheDocument()
  })

  it('renders the multi-selection group frame around mixed canvas element types', () => {
    const noteElement: CanvasElement = {
      ...shapeElement,
      content: 'Note',
      elementType: 'note',
      height: 100,
      id: 'note-1',
      width: 120,
      x: 520,
      y: 60,
      zIndex: 4,
    }

    render(
      <CanvasDrawingLayer
        canEdit
        editingElementId={null}
        elements={[shapeElement, noteElement]}
        onElementPointerDown={vi.fn()}
        onResizeHandlePointerDown={vi.fn()}
        onShapeClick={vi.fn()}
        onShapeEditorEscape={vi.fn()}
        onShapeEditorReady={vi.fn()}
        onShapeTextDraftChange={vi.fn()}
        previewDrawing={null}
        previewShape={null}
        selectedElementId={null}
        selectedElementIds={[shapeElement.id, noteElement.id]}
        shapeEditingStyleDraft={null}
        shapeTextFocusRequest={null}
        shapeTextDraft={null}
        showShapeSelectionHandles
        transformPreview={null}
      />,
    )

    expect(screen.getAllByTestId('canvas-selection-frame')).toHaveLength(1)
    expect(screen.getByTestId('canvas-selection-group-frame')).toHaveStyle({
      height: '200px',
      left: '120px',
      top: '60px',
      width: '520px',
      zIndex: '5',
    })
    expect(screen.queryByTestId('canvas-selection-handle-top-left')).not.toBeInTheDocument()
  })

  it('renders the active marquee rectangle above selected frames', () => {
    render(
      <CanvasDrawingLayer
        canEdit
        editingElementId={null}
        elements={[shapeElement]}
        onElementPointerDown={vi.fn()}
        onResizeHandlePointerDown={vi.fn()}
        onShapeClick={vi.fn()}
        onShapeEditorEscape={vi.fn()}
        onShapeEditorReady={vi.fn()}
        onShapeTextDraftChange={vi.fn()}
        previewDrawing={null}
        previewSelectionMarquee={{
          height: 120,
          width: 160,
          x: 80,
          y: 40,
        }}
        previewShape={null}
        selectedElementId={shapeElement.id}
        shapeEditingStyleDraft={null}
        shapeTextFocusRequest={null}
        shapeTextDraft={null}
        showShapeSelectionHandles
        transformPreview={null}
      />,
    )

    const marquee = screen.getByTestId('canvas-selection-marquee')

    expect(marquee).toHaveAttribute('style', expect.stringContaining('--color-canvas-selection'))
    expect(marquee).toHaveAttribute('style', expect.stringContaining('--color-canvas-selection-soft'))
    expect(marquee).toHaveStyle({
      height: '120px',
      left: '80px',
      top: '40px',
      width: '160px',
      zIndex: '5',
    })
  })

  it('renders smart alignment and size guides from transform previews', () => {
    const {rerender} = render(
      <CanvasDrawingLayer
        canEdit
        editingElementId={null}
        elements={[shapeElement]}
        onElementPointerDown={vi.fn()}
        onResizeHandlePointerDown={vi.fn()}
        onShapeClick={vi.fn()}
        onShapeEditorEscape={vi.fn()}
        onShapeEditorReady={vi.fn()}
        onShapeTextDraftChange={vi.fn()}
        previewDrawing={null}
        previewShape={null}
        selectedElementId={shapeElement.id}
        shapeEditingStyleDraft={null}
        shapeTextFocusRequest={null}
        shapeTextDraft={null}
        showShapeSelectionHandles
        transformPreview={null}
      />,
    )

    expect(screen.queryByTestId('canvas-smart-guides')).not.toBeInTheDocument()

    rerender(
      <CanvasDrawingLayer
        canEdit
        editingElementId={null}
        elements={[shapeElement]}
        onElementPointerDown={vi.fn()}
        onResizeHandlePointerDown={vi.fn()}
        onShapeClick={vi.fn()}
        onShapeEditorEscape={vi.fn()}
        onShapeEditorReady={vi.fn()}
        onShapeTextDraftChange={vi.fn()}
        previewDrawing={null}
        previewShape={null}
        selectedElementId={shapeElement.id}
        shapeEditingStyleDraft={null}
        shapeTextFocusRequest={null}
        shapeTextDraft={null}
        showShapeSelectionHandles
        transformPreview={{
          elementId: shapeElement.id,
          height: 180,
          width: 180,
          x: 160,
          y: 120,
          guides: {
            alignment: [{
              axis: 'x',
              kind: 'alignment',
              line: {
                x1: 250,
                x2: 250,
                y1: 80,
                y2: 300,
              },
            }],
            size: [{
              axis: 'width',
              kind: 'size',
              line: {
                x1: 160,
                x2: 340,
                y1: 114,
                y2: 114,
              },
              matchedSize: 180,
            }],
            spacing: [{
              axis: 'y',
              distance: 24,
              kind: 'spacing',
              segments: [{
                endCap: {
                  x1: 190,
                  x2: 200,
                  y1: 120,
                  y2: 120,
                },
                line: {
                  x1: 195,
                  x2: 195,
                  y1: 96,
                  y2: 120,
                },
                startCap: {
                  x1: 190,
                  x2: 200,
                  y1: 96,
                  y2: 96,
                },
              }],
            }],
          },
        }}
      />,
    )

    const guides = screen.getByTestId('canvas-smart-guides')
    const lines = guides.querySelectorAll('line')

    expect(guides).toHaveAttribute('aria-hidden', 'true')
    expect(guides).toHaveAttribute('focusable', 'false')
    expect(guides).toHaveStyle({zIndex: '4'})
    expect(lines).toHaveLength(5)
    expect(lines[0]).toHaveAttribute('stroke', CANVAS_ALIGNMENT_GUIDE_COLOR)
    expect(lines[0]).toHaveAttribute('x1', '250')
    expect(lines[0]).toHaveAttribute('y2', '300')
    expect(lines[1]).toHaveAttribute('stroke', CANVAS_SIZE_GUIDE_COLOR)
    expect(lines[1]).toHaveAttribute('stroke-width', '2.5')
    expect(lines[1]).toHaveAttribute('x2', '340')
    expect(lines[2]).toHaveAttribute('stroke', CANVAS_SPACING_GUIDE_COLOR)
    expect(lines[2]).toHaveAttribute('x1', '195')
    expect(lines[3]).toHaveAttribute('y1', '96')
    expect(lines[4]).toHaveAttribute('y1', '120')
  })

  it('renders spacing-only smart guides', () => {
    render(
      <CanvasDrawingLayer
        canEdit
        editingElementId={null}
        elements={[shapeElement]}
        onElementPointerDown={vi.fn()}
        onResizeHandlePointerDown={vi.fn()}
        onShapeClick={vi.fn()}
        onShapeEditorEscape={vi.fn()}
        onShapeEditorReady={vi.fn()}
        onShapeTextDraftChange={vi.fn()}
        previewDrawing={null}
        previewShape={null}
        selectedElementId={shapeElement.id}
        shapeEditingStyleDraft={null}
        shapeTextFocusRequest={null}
        shapeTextDraft={null}
        showShapeSelectionHandles
        transformPreview={{
          elementId: shapeElement.id,
          height: 180,
          width: 180,
          x: 160,
          y: 120,
          guides: {
            alignment: [],
            size: [],
            spacing: [{
              axis: 'x',
              distance: 24,
              kind: 'spacing',
              segments: [{
                endCap: {
                  x1: 244,
                  x2: 244,
                  y1: 170,
                  y2: 180,
                },
                line: {
                  x1: 220,
                  x2: 244,
                  y1: 175,
                  y2: 175,
                },
                startCap: {
                  x1: 220,
                  x2: 220,
                  y1: 170,
                  y2: 180,
                },
              }],
            }],
          },
        }}
      />,
    )

    const guides = screen.getByTestId('canvas-smart-guides')
    const lines = guides.querySelectorAll('line')

    expect(lines).toHaveLength(3)
    expect(lines[0]).toHaveAttribute('stroke', CANVAS_SPACING_GUIDE_COLOR)
    expect(lines[0]).toHaveAttribute('x1', '220')
    expect(lines[1]).toHaveAttribute('x1', '220')
    expect(lines[2]).toHaveAttribute('x1', '244')
  })

  it('renders explicit no-fill shapes as transparent', () => {
    const noFillShape: CanvasElement = {
      ...shapeElement,
      style: {
        ...shapeElement.style,
        fill_color: null,
      },
    }
    const {container} = render(
      <CanvasDrawingLayer
        canEdit
        editingElementId={null}
        elements={[noFillShape]}
        onElementPointerDown={vi.fn()}
        onResizeHandlePointerDown={vi.fn()}
        onShapeClick={vi.fn()}
        onShapeEditorEscape={vi.fn()}
        onShapeEditorReady={vi.fn()}
        onShapeTextDraftChange={vi.fn()}
        previewDrawing={null}
        previewShape={null}
        selectedElementId={noFillShape.id}
        shapeEditingStyleDraft={null}
        shapeTextFocusRequest={null}
        shapeTextDraft={null}
        showShapeSelectionHandles
        transformPreview={null}
      />,
    )

    expect(container.querySelector('ellipse')).toHaveAttribute('fill', 'transparent')
  })

  it('renders shapes without a stored fill using the default shape fill color', () => {
    const legacyShape: CanvasElement = {
      ...shapeElement,
      style: {
        ...shapeElement.style,
      },
    }

    delete legacyShape.style.fill_color

    const {container} = render(
      <CanvasDrawingLayer
        canEdit
        editingElementId={null}
        elements={[legacyShape]}
        onElementPointerDown={vi.fn()}
        onResizeHandlePointerDown={vi.fn()}
        onShapeClick={vi.fn()}
        onShapeEditorEscape={vi.fn()}
        onShapeEditorReady={vi.fn()}
        onShapeTextDraftChange={vi.fn()}
        previewDrawing={null}
        previewShape={null}
        selectedElementId={legacyShape.id}
        shapeEditingStyleDraft={null}
        shapeTextFocusRequest={null}
        shapeTextDraft={null}
        showShapeSelectionHandles
        transformPreview={null}
      />,
    )

    expect(container.querySelector('ellipse')).toHaveAttribute('fill', DEFAULT_CANVAS_SHAPE_FILL_COLOR)
  })

  it('does not enter text edit on the first click that selects a shape', () => {
    const onShapeClick = vi.fn()

    render(
      <CanvasDrawingLayer
        canEdit
        editingElementId={null}
        elements={[shapeElement]}
        onElementPointerDown={vi.fn()}
        onResizeHandlePointerDown={vi.fn()}
        onShapeClick={onShapeClick}
        onShapeEditorEscape={vi.fn()}
        onShapeEditorReady={vi.fn()}
        onShapeTextDraftChange={vi.fn()}
        previewDrawing={null}
        previewShape={null}
        selectedElementId={null}
        shapeEditingStyleDraft={null}
        shapeTextFocusRequest={null}
        shapeTextDraft={null}
        showShapeSelectionHandles
        transformPreview={null}
      />,
    )

    fireEvent.pointerDown(screen.getByText('Shape'))
    fireEvent.click(screen.getByText('Shape'))

    expect(onShapeClick).not.toHaveBeenCalled()
  })

  it('passes pointer coordinates when clicking a shape that was already selected before the click started', () => {
    const onShapeClick = vi.fn()
    const {rerender} = render(
      <CanvasDrawingLayer
        canEdit
        editingElementId={null}
        elements={[shapeElement]}
        onElementPointerDown={vi.fn()}
        onResizeHandlePointerDown={vi.fn()}
        onShapeClick={onShapeClick}
        onShapeEditorEscape={vi.fn()}
        onShapeEditorReady={vi.fn()}
        onShapeTextDraftChange={vi.fn()}
        previewDrawing={null}
        previewShape={null}
        selectedElementId={null}
        shapeEditingStyleDraft={null}
        shapeTextFocusRequest={null}
        shapeTextDraft={null}
        showShapeSelectionHandles
        transformPreview={null}
      />,
    )

    rerender(
      <CanvasDrawingLayer
        canEdit
        editingElementId={null}
        elements={[shapeElement]}
        onElementPointerDown={vi.fn()}
        onResizeHandlePointerDown={vi.fn()}
        onShapeClick={onShapeClick}
        onShapeEditorEscape={vi.fn()}
        onShapeEditorReady={vi.fn()}
        onShapeTextDraftChange={vi.fn()}
        previewDrawing={null}
        previewShape={null}
        selectedElementId={shapeElement.id}
        shapeEditingStyleDraft={null}
        shapeTextFocusRequest={null}
        shapeTextDraft={null}
        showShapeSelectionHandles
        transformPreview={null}
      />,
    )

    fireEvent.pointerDown(screen.getByText('Shape'))
    fireEvent.click(screen.getByText('Shape'))

    expect(onShapeClick).toHaveBeenCalledWith(
      shapeElement,
      expect.objectContaining({
        clientX: expect.any(Number),
        clientY: expect.any(Number),
        mode: 'pointer',
      }),
    )
  })
})
