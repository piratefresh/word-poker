import { useCallback, useRef, type RefObject, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSharedValue } from 'react-native-reanimated'
import { Gesture } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useOverlay } from './overlay-provider'
import { RadialMenu } from './radial-menu'

type RadialActionDef = { id: string; icon: any; title: string }

export function useRadialOverlay({
  actions,
  onSelect,
  onCancel,
  targetRef,
  renderClone,
}: {
  actions: RadialActionDef[]
  onSelect: (id: string) => void
  onCancel?: () => void
  targetRef: RefObject<View>
  renderClone: (layout: { x: number; y: number; width: number; height: number }) => ReactNode
}) {
  const { showOverlay, hideOverlay } = useOverlay()

  const cursorX = useSharedValue(0)
  const cursorY = useSharedValue(0)
  const releaseSignal = useSharedValue(0)
  const overlayOpen = useSharedValue(0)
  const isLongPressed = useSharedValue(false)

  const handleSelect = useCallback((id: string) => {
    hideOverlay()
    overlayOpen.set(0)
    onSelect(id)
  }, [hideOverlay, onSelect])

  const handleCancel = useCallback(() => {
    hideOverlay()
    overlayOpen.set(0)
    onCancel?.()
  }, [hideOverlay, onCancel])

  const openOverlayAt = useCallback((pressX: number, pressY: number) => {
    targetRef.current?.measureInWindow((x, y, width, height) => {
      const clone = renderClone({ x, y, width, height })
      const content = (
        <View style={[StyleSheet.absoluteFill, { zIndex: 10000 }]}>
          {clone}
          <RadialMenu
            pressX={pressX}
            pressY={pressY}
            cursorX={cursorX}
            cursorY={cursorY}
            releaseSignal={releaseSignal}
            actions={actions}
            onSelect={handleSelect}
            onCancel={handleCancel}
          />
        </View>
      )
      showOverlay(content)
      overlayOpen.set(1)
    })
  }, [actions, showOverlay, targetRef, cursorX, cursorY, releaseSignal, renderClone])

  const longPressGesture = Gesture.LongPress()
    .minDuration(500)
    .maxDistance(25)
    .onStart((event) => {
      'worklet'
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium)
      isLongPressed.set(true)
      cursorX.set(event.absoluteX)
      cursorY.set(event.absoluteY)
      runOnJS(openOverlayAt)(event.absoluteX, event.absoluteY)
    })
    .onFinalize(() => {
      'worklet'
      isLongPressed.set(false)
    })

  const panGesture = Gesture.Pan()
    .maxPointers(1)
    .activateAfterLongPress(500)
    .onBegin((e) => {
      'worklet'
      cursorX.set(e.absoluteX)
      cursorY.set(e.absoluteY)
    })
    .onUpdate((e) => {
      'worklet'
      cursorX.set(e.absoluteX)
      cursorY.set(e.absoluteY)
    })
    .onEnd(() => {
      'worklet'
      if (overlayOpen.get() === 1) {
        releaseSignal.set(releaseSignal.get() + 1)
      }
    })

  return { longPressGesture, panGesture, isLongPressed, overlayOpen }
}
