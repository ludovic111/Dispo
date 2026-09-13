import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeInLeft, FadeInRight, useReducedMotion } from 'react-native-reanimated';

/**
 * Entrée animée d'une étape : glisse depuis la droite en avançant, depuis la gauche en
 * revenant. Respecte « Réduire les animations » (aucune transition, contenu immédiat).
 */
export function OnboardingStepTransition({
  children,
  direction,
  stepKey,
}: {
  children: ReactNode;
  direction: 'backward' | 'forward';
  stepKey: string;
}) {
  const reduceMotion = useReducedMotion();
  const entering = reduceMotion
    ? undefined
    : (direction === 'forward' ? FadeInRight : FadeInLeft).duration(240);
  return (
    <Animated.View key={stepKey} {...(entering ? { entering } : {})} style={styles.flex}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
