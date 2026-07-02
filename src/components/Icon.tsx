import React from 'react';
import { StyleProp, TextStyle } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../theme/theme';

/**
 * App icon set. Ionicons for UI controls, MaterialCommunityIcons ('mci') for the
 * nicer apparel glyphs (t-shirt, hanger, etc.). Both fonts are bundled.
 */
export type IconSet = 'ion' | 'mci';
/** Icon glyph name (validated at runtime by the font). */
export type IconName = string;

interface IconProps {
  name: string;
  set?: IconSet;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function Icon({
  name,
  set = 'ion',
  size = 24,
  color = colors.ink,
  style,
}: IconProps) {
  const Family = set === 'mci' ? MaterialCommunityIcons : Ionicons;
  return <Family name={name} size={size} color={color} style={style} />;
}
