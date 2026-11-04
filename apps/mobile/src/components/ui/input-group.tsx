/**
 * A text field with addons, after shadcn/ui's InputGroup
 * (https://ui.shadcn.com/docs/components/input-group), in React Native.
 *
 * The group owns the frame — border, focus ring, invalid and disabled states — and lays
 * its children out as a row: inline-start addons, the borderless control, inline-end
 * addons. Block addons stack the group into a column instead. RN has no CSS `order` or
 * `:has()`, so the group reads its children to do what those selectors do in shadcn.
 *
 * ```tsx
 * <InputGroup>
 *   <InputGroupInput placeholder="Search…" />
 *   <InputGroupAddon><SymbolView name={…} /></InputGroupAddon>
 *   <InputGroupAddon align="inline-end">
 *     <InputGroupButton label="Clear" onPress={clear} size="icon-xs">…</InputGroupButton>
 *   </InputGroupAddon>
 * </InputGroup>
 * ```
 */

import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { fonts, tileMaterial } from "@/constants/theme";

/** The field palette: cream paper, tan frame, copper focus. */
export const INPUT_GROUP_COLORS = {
  fill: "#fffdf6",
  border: "#dcc196",
  focus: tileMaterial.slab,
  invalid: "#c2352b",
  text: "#3a2210",
  muted: "#7a5634",
  placeholder: "#a8967e",
} as const;

type Align = "inline-start" | "inline-end" | "block-start" | "block-end";

type GroupState = {
  inputRef: RefObject<TextInput | null>;
  disabled: boolean;
  setFocused: (focused: boolean) => void;
  /** Which sides carry an addon, so the control trims its padding there (shadcn's `has-[>[data-align=…]]`). */
  sides: Set<Align>;
};

const GroupContext = createContext<GroupState | null>(null);

function useGroup(part: string): GroupState {
  const group = useContext(GroupContext);
  if (!group) throw new Error(`${part} must be used inside an InputGroup`);
  return group;
}

/**
 * shadcn's `order-first` / `order-last`: start addons lead, end addons trail, whatever the
 * JSX order. The control (anything that is not an addon) ranks 2, between them.
 */
const ORDER: Record<Align, number> = { "block-start": 0, "inline-start": 1, "inline-end": 3, "block-end": 4 };
const CONTROL_RANK = 2;

function alignOf(child: ReactNode): Align | null {
  if (!isValidElement(child) || child.type !== InputGroupAddon) return null;
  return (child as ReactElement<{ align?: Align }>).props.align ?? "inline-start";
}

export type InputGroupProps = {
  children: ReactNode;
  /** Dims the group and makes its control read-only (shadcn's `has-disabled`). */
  disabled?: boolean;
  /** Red frame and ring (shadcn's `has-[[aria-invalid=true]]`). */
  invalid?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function InputGroup({ children, disabled = false, invalid = false, style }: InputGroupProps) {
  const inputRef = useRef<TextInput | null>(null);
  const [focused, setFocused] = useState(false);

  const items = Children.toArray(children);
  const sides = new Set(items.map(alignOf).filter((align): align is Align => align !== null));
  const sidesKey = [...sides].sort().join(" ");
  const ordered = items
    .map((child, index) => {
      const align = alignOf(child);
      return { child, index, rank: align ? ORDER[align] : CONTROL_RANK };
    })
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ child }) => child);
  // Block addons, or a textarea, stack the group and let it grow (shadcn's `has-[>[data-align=block-*]]:flex-col`).
  const stacked =
    sides.has("block-start") ||
    sides.has("block-end") ||
    items.some((child) => isValidElement(child) && child.type === InputGroupTextarea);

  const state = useMemo(
    () => ({ inputRef, disabled, setFocused, sides: new Set(sidesKey.split(" ").filter(Boolean) as Align[]) }),
    [disabled, sidesKey],
  );

  return (
    <GroupContext.Provider value={state}>
      <View
        role="group"
        style={[
          styles.group,
          stacked && styles.groupStacked,
          focused && styles.groupFocused,
          invalid && styles.groupInvalid,
          disabled && styles.groupDisabled,
          style,
        ]}
      >
        {ordered}
      </View>
    </GroupContext.Provider>
  );
}

export type InputGroupAddonProps = {
  children: ReactNode;
  align?: Align;
  style?: StyleProp<ViewStyle>;
};

/**
 * Icons, text or buttons beside (or above / below) the control. Tapping the addon focuses
 * the control — unless the tap lands on a button inside it, which handles its own press,
 * just as shadcn's addon skips `closest("button")`.
 */
export function InputGroupAddon({ children, align = "inline-start", style }: InputGroupAddonProps) {
  const { inputRef, disabled } = useGroup("InputGroupAddon");
  const holdsButton = Children.toArray(children).some(
    (child) => isValidElement(child) && child.type === InputGroupButton,
  );

  return (
    <Pressable
      accessible={false}
      disabled={disabled}
      onPress={() => inputRef.current?.focus()}
      style={[styles.addon, ADDON_ALIGN[align], holdsButton && BUTTON_NUDGE[align], style]}
    >
      {children}
    </Pressable>
  );
}

type ButtonSize = "xs" | "sm" | "icon-xs" | "icon-sm";

export type InputGroupButtonProps = Omit<PressableProps, "children" | "style"> & {
  children: ReactNode;
  /** Read by screen readers; required, since icon buttons have no text of their own. */
  label: string;
  size?: ButtonSize;
  style?: StyleProp<ViewStyle>;
};

/** A ghost button sized to sit inside the frame. */
export function InputGroupButton({ children, label, size = "xs", style, disabled, ...press }: InputGroupButtonProps) {
  const group = useContext(GroupContext);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled ?? group?.disabled}
      hitSlop={size.startsWith("icon") ? 6 : 0}
      style={({ pressed }) => [styles.button, BUTTON_SIZE[size], pressed && styles.buttonPressed, style]}
      {...press}
    >
      {children}
    </Pressable>
  );
}

/** Muted text inside an addon: a prefix, a unit, a count. */
export function InputGroupText({ style, ...text }: TextProps) {
  return <Text style={[styles.text, style]} {...text} />;
}

export type InputGroupInputProps = TextInputProps & { ref?: Ref<TextInput> };

/** The borderless control; the group draws the frame around it. */
export function InputGroupInput({ ref, style, onFocus, onBlur, editable, ...input }: InputGroupInputProps) {
  const { inputRef, disabled, setFocused, sides } = useGroup("InputGroupInput");

  return (
    <TextInput
      editable={!disabled && editable !== false}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      placeholderTextColor={INPUT_GROUP_COLORS.placeholder}
      ref={(node) => {
        inputRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      style={[
        styles.control,
        sides.has("inline-start") && styles.controlAfterStart,
        sides.has("inline-end") && styles.controlBeforeEnd,
        sides.has("block-start") && styles.controlBelowBlock,
        sides.has("block-end") && styles.controlAboveBlock,
        style,
      ]}
      {...input}
    />
  );
}

/** A multi-line control; the group grows with it. */
export function InputGroupTextarea({ style, ...input }: InputGroupInputProps) {
  return <InputGroupInput multiline style={[styles.textarea, style]} textAlignVertical="top" {...input} />;
}

const ADDON_ALIGN: Record<Align, ViewStyle> = {
  "inline-start": { paddingLeft: 12 },
  "inline-end": { paddingRight: 12 },
  "block-start": { alignSelf: "stretch", justifyContent: "flex-start", paddingHorizontal: 14, paddingTop: 10 },
  "block-end": { alignSelf: "stretch", justifyContent: "flex-start", paddingHorizontal: 14, paddingBottom: 10 },
};

/** A button's own padding already gives it room, so its addon tucks it toward the edge. */
const BUTTON_NUDGE: Partial<Record<Align, ViewStyle>> = {
  "inline-start": { marginLeft: -6 },
  "inline-end": { marginRight: -6 },
};

const BUTTON_SIZE: Record<ButtonSize, ViewStyle> = {
  xs: { borderRadius: 6, gap: 4, height: 28, paddingHorizontal: 8 },
  sm: { borderRadius: 8, gap: 6, height: 36, paddingHorizontal: 10 },
  "icon-xs": { borderRadius: 6, height: 28, width: 28 },
  "icon-sm": { borderRadius: 8, height: 36, width: 36 },
};

const styles = StyleSheet.create({
  group: {
    alignItems: "center",
    backgroundColor: INPUT_GROUP_COLORS.fill,
    borderColor: INPUT_GROUP_COLORS.border,
    borderRadius: 10,
    borderWidth: 2,
    flexDirection: "row",
    height: 48,
    minWidth: 0,
    width: "100%",
  },
  groupStacked: {
    alignItems: "stretch",
    flexDirection: "column",
    height: "auto",
  },
  /** The copper frame and a soft ring carry focus, so the browser's own outline is off. */
  groupFocused: {
    borderColor: INPUT_GROUP_COLORS.focus,
    boxShadow: "0px 0px 0px 3px rgba(196, 116, 58, 0.25)",
  },
  groupInvalid: {
    borderColor: INPUT_GROUP_COLORS.invalid,
    boxShadow: "0px 0px 0px 3px rgba(194, 53, 43, 0.2)",
  },
  groupDisabled: {
    opacity: 0.5,
  },
  addon: {
    alignItems: "center",
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    /** shadcn's `cursor-text`: the addon is part of the field, not a link. */
    ...Platform.select({ web: { cursor: "text" } as unknown as ViewStyle }),
  },
  button: {
    alignItems: "center",
    backgroundColor: "transparent",
    flexDirection: "row",
    justifyContent: "center",
  },
  buttonPressed: {
    backgroundColor: "rgba(122, 86, 52, 0.12)",
  },
  text: {
    color: INPUT_GROUP_COLORS.muted,
    fontFamily: fonts.rubikMedium,
    fontSize: 14,
  },
  control: {
    alignSelf: "stretch",
    backgroundColor: "transparent",
    borderWidth: 0,
    color: INPUT_GROUP_COLORS.text,
    flex: 1,
    fontFamily: fonts.rubikMedium,
    fontSize: 16,
    minWidth: 0,
    paddingHorizontal: 14,
    /**
     * RN's style types only allow solid/dotted/dashed, but web needs `none` to
     * drop the blue UA focus ring, and RN Web hands the value straight to CSS.
     */
    ...Platform.select({
      web: { outlineStyle: "none" } as unknown as TextStyle,
    }),
  },
  controlAfterStart: { paddingLeft: 6 },
  controlBeforeEnd: { paddingRight: 6 },
  controlBelowBlock: { flex: 0, minHeight: 44, paddingBottom: 12 },
  controlAboveBlock: { flex: 0, minHeight: 44, paddingTop: 12 },
  textarea: {
    flex: 0,
    minHeight: 72,
    paddingVertical: 10,
  },
});
