import React from 'react';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, G, Rect, Line } from 'react-native-svg';
import { View } from 'react-native';

interface LogoProps {
  size?: number;
  variant?: 'full' | 'icon' | 'monochrome';
}

export const AndyLogo: React.FC<LogoProps> = ({ size = 80, variant = 'full' }) => {
  if (variant === 'icon') {
    // Version icône simplifiée pour favicon/sidebar
    return (
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="gradIcon" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#3B82F6" />
            <Stop offset="100%" stopColor="#8B5CF6" />
          </LinearGradient>
        </Defs>
        
        {/* Loupe circle */}
        <Circle cx="45" cy="45" r="30" fill="none" stroke="url(#gradIcon)" strokeWidth="6" />
        
        {/* Scan effect inside loupe */}
        <Line x1="30" y1="35" x2="60" y2="35" stroke="url(#gradIcon)" strokeWidth="2" opacity="0.6" />
        <Line x1="30" y1="45" x2="60" y2="45" stroke="url(#gradIcon)" strokeWidth="2" opacity="0.8" />
        <Line x1="30" y1="55" x2="60" y2="55" stroke="url(#gradIcon)" strokeWidth="2" opacity="0.6" />
        
        {/* Loupe handle */}
        <Path
          d="M 65 65 L 85 85"
          stroke="url(#gradIcon)"
          strokeWidth="8"
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  if (variant === 'monochrome') {
    // Version monochrome pour fond clair/foncé
    return (
      <Svg width={size} height={size} viewBox="0 0 120 120">
        {/* Silhouette personnage */}
        <Path
          d="M 40 50 Q 40 35 50 30 Q 55 28 60 30 Q 70 35 70 50 L 70 75 Q 70 80 65 82 L 60 85 L 50 85 L 45 82 Q 40 80 40 75 Z"
          fill="#1C1C1E"
        />
        
        {/* Barbe stylisée */}
        <Path
          d="M 45 65 Q 42 70 42 75 L 45 78 Q 50 80 55 80 Q 60 80 65 78 L 68 75 Q 68 70 65 65 Z"
          fill="#1C1C1E"
        />
        
        {/* Bras tenant loupe */}
        <Path d="M 70 60 L 95 55" stroke="#1C1C1E" strokeWidth="4" strokeLinecap="round" />
        
        {/* Loupe */}
        <Circle cx="95" cy="45" r="18" fill="none" stroke="#1C1C1E" strokeWidth="4" />
        <Path d="M 108 58 L 118 68" stroke="#1C1C1E" strokeWidth="5" strokeLinecap="round" />
      </Svg>
    );
  }

  // Version complète (full)
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <LinearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#3B82F6" />
          <Stop offset="50%" stopColor="#6366F1" />
          <Stop offset="100%" stopColor="#8B5CF6" />
        </LinearGradient>
        <LinearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#10B981" />
          <Stop offset="100%" stopColor="#3B82F6" />
        </LinearGradient>
      </Defs>
      
      {/* Corps du personnage */}
      <Path
        d="M 40 50 Q 40 35 50 30 Q 55 28 60 30 Q 70 35 70 50 L 70 75 Q 70 80 65 82 L 60 85 L 50 85 L 45 82 Q 40 80 40 75 Z"
        fill="url(#grad1)"
        opacity="0.9"
      />
      
      {/* Tête */}
      <Circle cx="55" cy="35" r="12" fill="url(#grad1)" />
      
      {/* Barbe caractéristique */}
      <Path
        d="M 45 40 Q 42 45 42 50 L 45 53 Q 50 55 55 55 Q 60 55 65 53 L 68 50 Q 68 45 65 40 Z"
        fill="url(#grad1)"
        opacity="0.85"
      />
      
      {/* Petits traits de barbe */}
      <Path d="M 48 48 L 48 52" stroke="#FFF" strokeWidth="1" opacity="0.6" />
      <Path d="M 55 48 L 55 53" stroke="#FFF" strokeWidth="1" opacity="0.6" />
      <Path d="M 62 48 L 62 52" stroke="#FFF" strokeWidth="1" opacity="0.6" />
      
      {/* Bras tenant la loupe */}
      <Path
        d="M 70 60 Q 80 58 90 55"
        stroke="url(#grad1)"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      
      {/* Loupe - cercle principal */}
      <Circle
        cx="95"
        cy="45"
        r="20"
        fill="rgba(255,255,255,0.2)"
        stroke="url(#grad2)"
        strokeWidth="4"
      />
      
      {/* Effet scan dans la loupe */}
      <G opacity="0.7">
        <Line x1="82" y1="38" x2="108" y2="38" stroke="url(#grad2)" strokeWidth="1.5" />
        <Line x1="82" y1="45" x2="108" y2="45" stroke="url(#grad2)" strokeWidth="2" />
        <Line x1="82" y1="52" x2="108" y2="52" stroke="url(#grad2)" strokeWidth="1.5" />
        
        {/* Points lumineux */}
        <Circle cx="90" cy="42" r="1.5" fill="#3B82F6" opacity="0.8" />
        <Circle cx="100" cy="48" r="1.5" fill="#8B5CF6" opacity="0.8" />
        <Circle cx="95" cy="50" r="1" fill="#10B981" opacity="0.8" />
      </G>
      
      {/* Reflet sur loupe */}
      <Path
        d="M 88 38 Q 90 36 93 36 Q 96 36 98 38"
        stroke="#FFF"
        strokeWidth="2"
        fill="none"
        opacity="0.4"
        strokeLinecap="round"
      />
      
      {/* Manche de la loupe */}
      <Path
        d="M 110 60 L 118 68"
        stroke="url(#grad1)"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </Svg>
  );
};

export default AndyLogo;
