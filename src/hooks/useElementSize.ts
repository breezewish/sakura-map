import { useCallback, useLayoutEffect, useState } from "react"

export type ElementSize = {
  width: number
  height: number
}

export function useElementSize<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null)
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })

  const ref = useCallback((node: T | null) => {
    setElement(node)
  }, [])

  useLayoutEffect(() => {
    if (!element) return

    const updateSize = () => {
      setSize({ width: element.clientWidth, height: element.clientHeight })
    }

    updateSize()

    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(element)

    return () => {
      resizeObserver.disconnect()
    }
  }, [element])

  return { ref, size }
}

