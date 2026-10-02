import { BlurView } from "expo-blur";
import { createContext, useCallback, useContext, useState } from "react";
import { StyleSheet, View, type ReactNode } from "react-native";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

interface OverlayContextValue {
  showOverlay: (content: ReactNode) => void;
  hideOverlay: () => void;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

export function useOverlay() {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error("useOverlay must be used within OverlayProvider");
  return ctx;
}

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [isVisible, setIsVisible] = useState(false);
  const [overlayContent, setOverlayContent] = useState<ReactNode>(null);

  const blurIntensity = useSharedValue(0);
  const overlayOpacity = useSharedValue(0);
  const contentScale = useSharedValue(1);
  const contentRotation = useSharedValue(0);

  const showOverlay = useCallback((content: ReactNode) => {
    setOverlayContent(content);
    setIsVisible(true);
    overlayOpacity.set(withTiming(1, { duration: 300 }));
    blurIntensity.set(withTiming(100, { duration: 300 }));
    contentScale.set(withTiming(1.1, { duration: 300 }));
    contentRotation.set(withTiming(Math.random() * 6 - 3, { duration: 300 }));
  }, []);

  const hideOverlay = useCallback(() => {
    overlayOpacity.set(withTiming(0, { duration: 200 }));
    blurIntensity.set(withTiming(0, { duration: 200 }));
    contentScale.set(withTiming(1, { duration: 200 }));
    contentRotation.set(withTiming(0, { duration: 200 }));
    setTimeout(() => {
      setIsVisible(false);
      setOverlayContent(null);
    }, 200);
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.get(),
    zIndex: 9998,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.get(),
    transform: [
      { scale: contentScale.get() },
      { rotate: `${contentRotation.get()}deg` },
    ],
    zIndex: 9999,
  }));

  const blurAnimatedProps = useAnimatedProps(() => ({
    intensity: blurIntensity.get(),
  }));

  return (
    <OverlayContext.Provider value={{ showOverlay, hideOverlay }}>
      {children}
      {isVisible && (
        <>
          <Animated.View style={[StyleSheet.absoluteFillObject, overlayStyle]}>
            <AnimatedBlurView
              tint="dark"
              style={StyleSheet.absoluteFill}
              animatedProps={blurAnimatedProps}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: "rgba(0,0,0,0.7)" },
              ]}
            />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFillObject, contentStyle]}>
            {overlayContent}
          </Animated.View>
        </>
      )}
    </OverlayContext.Provider>
  );
}
