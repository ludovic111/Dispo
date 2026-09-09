import { MaskedView } from '@expo/ui/community/masked-view';
import * as Haptics from 'expo-haptics';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  type PropsWithChildren,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '@/components/ui/app-text';
import { billetInk } from '@/theme/tokens';

export interface AcceptedSos {
  title: string;
  date: string;
}
type Celebration = AcceptedSos & { onComplete?: () => void };
const Context = createContext<(sos: Celebration) => void>(() => undefined);
export const useSosAcceptanceCelebration = () => useContext(Context);

function AcceptanceEffect({ sos, onComplete }: { sos: Celebration; onComplete: () => void }) {
  const { width, height } = useWindowDimensions();
  const { t, i18n } = useTranslation();
  const [progress] = useState(() => new Animated.Value(0));
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [shown, setShown] = useState(false);
  const complete = useEffectEvent(onComplete);
  const ticketWidth = Math.min(width - 40, 370);
  const seam = ticketWidth * 0.73;
  const zigzag = Array.from(
    { length: 15 },
    (_, i) => `L ${seam + (i % 2 ? 5 : -5)} ${i * 10}`,
  ).join(' ');
  const leftPath = `M 0 0 L ${seam} 0 ${zigzag} L ${seam} 146 L 0 146 Z`;
  const rightPath = `M ${ticketWidth} 0 L ${seam} 0 ${zigzag} L ${seam} 146 L ${ticketWidth} 146 Z`;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => true)
      .then((value) => {
        if (active) setReduced(value);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!shown || reduced === null) return;
    let active = true;
    let tear: ReturnType<typeof setTimeout> | undefined;
    let animation: Animated.CompositeAnimation | undefined;
    // Begin after the native modal and its masks have been laid out.
    const start = setTimeout(() => {
      AccessibilityInfo.announceForAccessibility(t('Dépannage accepté'));
      if (Platform.OS === 'ios') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => undefined,
        );
        if (!reduced)
          tear = setTimeout(() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
          }, 140);
      }
      animation = Animated.timing(progress, {
        toValue: 1,
        duration: reduced ? 500 : 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      });
      animation.start(({ finished }) => {
        if (active && finished) complete();
      });
    }, 80);
    return () => {
      active = false;
      clearTimeout(start);
      clearTimeout(tear);
      animation?.stop();
    };
  }, [progress, reduced, shown, t]);
  const locale = i18n.resolvedLanguage ?? 'fr';
  const date = new Date(sos.date);
  const dateLabel = Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
  return (
    <Modal
      transparent
      animationType="none"
      statusBarTranslucent
      visible={reduced !== null}
      onRequestClose={onComplete}
      onShow={() => setShown(true)}
    >
      <View style={styles.overlay} accessibilityViewIsModal>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: '#050814',
              opacity: progress.interpolate({
                inputRange: [0, 0.12, 0.8, 1],
                outputRange: [0.25, 0.72, 0.72, 0],
              }),
            },
          ]}
        />
        {!reduced ? (
          <View
            style={{ width: ticketWidth, height: 146 }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {[-1, 1].map((direction) => (
              <Animated.View
                key={direction}
                style={[
                  StyleSheet.absoluteFill,
                  {
                    opacity: progress.interpolate({
                      inputRange: [0, 0.15, 0.6, 1],
                      outputRange: [1, 1, 0, 0],
                    }),
                    transform: [
                      {
                        translateX: progress.interpolate({
                          inputRange: [0, 0.1, 0.6, 1],
                          outputRange: [0, 0, direction * 100, direction * 100],
                        }),
                      },
                      {
                        translateY: progress.interpolate({
                          inputRange: [0, 0.1, 0.6, 1],
                          outputRange: [0, 0, 90, 90],
                        }),
                      },
                      {
                        rotate: progress.interpolate({
                          inputRange: [0, 0.1, 0.6, 1],
                          outputRange: [
                            '0deg',
                            '0deg',
                            `${direction * 15}deg`,
                            `${direction * 15}deg`,
                          ],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <MaskedView
                  style={{ width: ticketWidth, height: 146 }}
                  maskElement={
                    <Svg width={ticketWidth} height={146}>
                      <Path d={direction < 0 ? leftPath : rightPath} fill="#000" />
                    </Svg>
                  }
                >
                  <View style={styles.ticket}>
                    <View style={{ width: seam - 22, gap: 8 }}>
                      <AppText color="#05856E" variant="caption">
                        {t('SOS')}
                      </AppText>
                      <AppText color={billetInk} numberOfLines={2} variant="title">
                        {sos.title}
                      </AppText>
                    </View>
                    <AppText
                      color={billetInk}
                      style={{ width: ticketWidth - seam - 14, textAlign: 'center' }}
                      variant="caption"
                    >
                      {dateLabel}
                    </AppText>
                  </View>
                </MaskedView>
              </Animated.View>
            ))}
          </View>
        ) : null}
        <Animated.View
          style={[
            styles.confirmation,
            {
              opacity: reduced
                ? 1
                : progress.interpolate({
                    inputRange: [0, 0.3, 0.5, 0.85, 1],
                    outputRange: [0, 0, 1, 1, 0],
                  }),
            },
          ]}
        >
          <AppText color="#FFFFFF" variant="title">
            {t('Dépannage accepté')}
          </AppText>
          <AppText color="#D9E9FF">{t('Retrouve ce rendez-vous dans Sessions')}</AppText>
        </Animated.View>
        {!reduced
          ? Array.from({ length: 24 }, (_, index) => {
              const spread = (((index * 17) % 25) - 12) / 12;
              const peak = height * (0.27 + (index % 5) * 0.035);
              return (
                <Animated.View
                  key={index}
                  pointerEvents="none"
                  style={[
                    styles.confetti,
                    {
                      backgroundColor: ['#24A9F2', '#58D8EF', '#43CEA5', '#EFBC70'][index % 4],
                      left: width / 2,
                      width: index % 2 ? 5 : 7,
                      opacity: progress.interpolate({
                        inputRange: [0, 0.1, 0.2, 0.75, 1],
                        outputRange: [0, 0, 1, 1, 0],
                      }),
                      transform: [
                        {
                          translateX: progress.interpolate({
                            inputRange: [0, 0.1, 1],
                            outputRange: [0, 0, spread * width * 0.49],
                          }),
                        },
                        {
                          translateY: progress.interpolate({
                            inputRange: [0, 0.1, 0.55, 1],
                            outputRange: [0, 0, -peak, -peak * 0.5],
                          }),
                        },
                        {
                          rotate: progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', `${(index % 2 ? 1 : -1) * 330}deg`],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              );
            })
          : null}
      </View>
    </Modal>
  );
}

export function SosAcceptanceCelebrationProvider({ children }: PropsWithChildren) {
  const [sos, setSos] = useState<Celebration | null>(null);
  const celebrate = useCallback((next: Celebration) => setSos(next), []);
  const finish = useCallback(() => {
    setSos(null);
    sos?.onComplete?.();
  }, [sos]);
  return (
    <Context.Provider value={celebrate}>
      {children}
      {sos ? <AcceptanceEffect sos={sos} onComplete={finish} /> : null}
    </Context.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ticket: {
    height: 146,
    padding: 16,
    backgroundColor: '#F0F4FF',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  confirmation: { position: 'absolute', alignItems: 'center', gap: 8, paddingHorizontal: 24 },
  confetti: { position: 'absolute', bottom: -10, height: 10, borderRadius: 1 },
});
