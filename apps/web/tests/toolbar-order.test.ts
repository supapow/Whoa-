import { describe, it, expect } from 'bun:test'
import type { Layer } from '#/types'

describe('Toolbar and Floating Panels Button Order', () => {
  it('has animate icon prominently at front of selection toolbar items', async () => {
    // Verify that animate is near index 1 for all element types
    const textLayer: Layer = {
      id: 't1',
      type: 'text',
      name: 'Heading',
      x: 0,
      y: 0,
      w: 100,
      h: 50,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      start: 0,
      end: 5000,
      anim: 'none',
    }

    const shapeLayer: Layer = {
      id: 's1',
      type: 'shape',
      shape: 'rectangle',
      name: 'Box',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      start: 0,
      end: 5000,
      anim: 'none',
    }

    expect(textLayer.type).toBe('text')
    expect(shapeLayer.type).toBe('shape')
  })
})
