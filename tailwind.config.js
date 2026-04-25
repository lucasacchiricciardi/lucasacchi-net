module.exports = {
  content: ["./src/home/**/*.html"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: '#f8f9fa',
        'surface-container': '#edeeef',
        'surface-container-low': '#f3f4f5',
        'surface-container-high': '#e7e8e9',
        'surface-container-highest': '#e1e3e4',
        'surface-container-lowest': '#ffffff',
        'surface-dim': '#d9dadb',
        'on-surface': '#191c1d',
        'on-surface-variant': '#424752',
        primary: '#003f87',
        'primary-container': '#0056b3',
        'on-primary': '#ffffff',
        'on-primary-container': '#bbd0ff',
        secondary: '#5f5e5f',
        error: '#ba1a1a',
        'error-container': '#ffdad6',
        'on-error': '#ffffff',
        'on-error-container': '#93000a',
        outline: '#727784',
        'outline-variant': '#c2c6d4'
      },
      fontFamily: {
        headline: ['IBM Plex Serif', 'serif'],
        body: ['Inter', 'sans-serif'],
        label: ['IBM Plex Mono', 'monospace']
      },
      borderRadius: {
        DEFAULT: '0.25rem'
      }
    }
  },
  plugins: []
};
