import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

// Use direct URL for the logo image to avoid Metro bundler issues
const LOGO_URL = 'https://customer-assets.emergentagent.com/job_1203fa27-9840-4fe1-8cf7-d7b2a439308c/artifacts/wmgxfcj1_image.png';

interface LogoProps {
  size?: number;
  variant?: 'full' | 'icon' | 'square';
}

export const ProspectLocalLogo: React.FC<LogoProps> = ({ size = 80, variant = 'full' }) => {
  // Calculate dimensions based on variant
  const dimensions = {
    full: { width: size, height: size },
    icon: { width: size, height: size },
    square: { width: size, height: size },
  };

  const { width, height } = dimensions[variant];

  return (
    <View style={[styles.container, { width, height }]}>
      <Image
        source={{ uri: LOGO_URL }}
        style={[styles.logo, { width, height }]}
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    borderRadius: 8,
  },
});

export default ProspectLocalLogo;
