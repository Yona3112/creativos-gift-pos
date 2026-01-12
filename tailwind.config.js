/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./pages/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./*.{js,ts,jsx,tsx}"
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['"Plus Jakarta Sans"', 'sans-serif'],
            },
            colors: {
                primary: 'var(--primary-color, #4F46E5)',
                accent: 'var(--accent-color, #8B5CF6)',
                success: '#10B981',
                warning: '#F59E0B',
                danger: '#EF4444',
                surface: '#F3F4F6',
            },
            keyframes: {
                popIn: {
                    '0%': { opacity: '0', transform: 'scale(0.9) translateY(10px)' },
                    '100%': { opacity: '1', transform: 'scale(1) translateY(0)' }
                },
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' }
                }
            },
            animation: {
                'pop-in': 'popIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) backwards',
                'fade-in': 'fadeIn 0.5s ease-out forwards'
            }
        }
    },
    plugins: [],
}
