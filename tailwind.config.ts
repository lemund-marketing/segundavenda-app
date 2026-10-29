import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		// app: o app é sempre o desenho de celular, também deitado e no tablet
		// (ver src/hooks/use-mobile.tsx). Os tamanhos de computador (md para
		// cima) nunca valem nas cópias do site; sm continua, como no celular.
		screens: { sm: '640px', md: '100000px', lg: '100001px', xl: '100002px', '2xl': '100003px' },
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
					glow: 'hsl(var(--primary-glow))',
					dark: 'hsl(var(--primary-dark))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))',
					glow: 'hsl(var(--secondary-glow))'
				},
				brand: {
					green: 'hsl(var(--accent-green))',
					purple: 'hsl(var(--accent-purple))',
					blue: 'hsl(var(--accent-blue))',
					amber: 'hsl(var(--accent-amber))',
					teal: 'hsl(var(--accent-teal))'
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))',
					glow: 'hsl(var(--success-glow))'
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				}
			},
			/* Arredondamento único no projeto inteiro (pedido de 06/08, véspera do
			   cutover; subiu de 8px para 12px em 20/08/2026): a escala achatada
			   faz rounded-sm…rounded-3xl renderizarem igual, então nenhum
			   componente precisa ser caçado um a um. rounded-full fica de fora —
			   pílulas, avatares e barras de progresso continuam circulares. */
			borderRadius: {
				DEFAULT: '0.75rem',
				sm: '0.75rem',
				md: '0.75rem',
				lg: '0.75rem',
				xl: '0.75rem',
				'2xl': '0.75rem',
				'3xl': '0.75rem'
			},
			backgroundImage: {
				'gradient-primary': 'var(--gradient-primary)',
				'gradient-secondary': 'var(--gradient-secondary)',
				'gradient-brand': 'var(--gradient-brand)',
				'gradient-success': 'var(--gradient-success)',
				'gradient-positive': 'var(--gradient-positive)',
				'gradient-card': 'var(--gradient-card)',
				'gradient-rainbow': 'linear-gradient(90deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #4facfe 75%, #667eea 100%)'
			},
			boxShadow: {
				sm: 'var(--shadow-sm)',
				md: 'var(--shadow-md)',
				lg: 'var(--shadow-lg)',
				elegant: 'var(--shadow-elegant)',
				card: 'var(--shadow-card)',
				hover: 'var(--shadow-hover)',
				brand: 'var(--shadow-sm)',
				'brand-hover': 'var(--shadow-hover)',
				'brand-elevated': 'var(--shadow-lg)',
				rainbow: '0 4px 15px rgba(102, 126, 234, 0.4), 0 0 20px rgba(118, 75, 162, 0.2)'
			},
			transitionTimingFunction: {
				smooth: 'var(--transition-smooth)',
				bounce: 'var(--transition-bounce)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'gradient-shift': {
					'0%, 100%': {
						backgroundSize: '200% 200%',
						backgroundPosition: '0% 50%'
					},
					'50%': {
						backgroundSize: '200% 200%',
						backgroundPosition: '100% 50%'
					}
				},
				'number-slide-out': {
					'0%': {
						transform: 'translateY(0)',
						opacity: '1'
					},
					'100%': {
						transform: 'translateY(-100%)',
						opacity: '0'
					}
				},
				'number-slide-in': {
					'0%': {
						transform: 'translateY(100%)',
						opacity: '0'
					},
					'100%': {
						transform: 'translateY(0)',
						opacity: '1'
					}
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'gradient-shift': 'gradient-shift 3s ease infinite',
				'number-slide-out': 'number-slide-out 0.15s ease-out forwards',
				'number-slide-in': 'number-slide-in 0.15s ease-out forwards'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
