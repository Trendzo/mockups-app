import { useEffect, useState } from 'react';
import { Keyboard, KeyboardEvent, LayoutAnimation, Platform } from 'react-native';

/** Animate the next layout with the keyboard's own curve (what KeyboardAvoidingView does). */
function syncWithKeyboard(e: KeyboardEvent) {
  if (Platform.OS !== 'ios' || !e?.duration) return;
  const duration = Math.max(10, e.duration);
  LayoutAnimation.configureNext({
    duration,
    update: { duration, type: LayoutAnimation.Types.keyboard },
  });
}

/**
 * Current on-screen keyboard height (0 when hidden).
 *
 * iOS listens to the `will` events so the value is available before the show
 * animation (lets a footer rise in step with the keyboard). Android uses `did`
 * and, with `adjustResize` in the manifest, the window already resizes - callers
 * typically ignore this value on Android and let the resize lift the footer.
 */
export function useKeyboardHeight({ animate = false }: { animate?: boolean } = {}): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    // `animate`: the layout change rides the keyboard's animation, so a pinned
    // footer rises with it instead of jumping ahead (or being covered on hide).
    const show = Keyboard.addListener(showEvt, (e) => {
      if (animate) syncWithKeyboard(e);
      setHeight(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener(hideEvt, (e) => {
      if (animate) syncWithKeyboard(e);
      setHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [animate]);

  return height;
}
