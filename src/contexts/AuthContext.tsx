'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { jwtVerify } from 'jose';

interface UserData {
  user_id: number;
  email: string;
  name: string;
  membership_level: string;
  companyName?: string;
  positionTitle?: string;
  jobDescription?: string;
  exp?: number;
  iat?: number;
}

interface AuthContextType {
  user: UserData | null;
  loading: boolean;
  contextLoaded: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  contextLoaded: false
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [contextLoaded, setContextLoaded] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const loadContext = async () => {
      console.log('[Auth] Checking for context parameter...');
      const token = searchParams?.get('context');

      if (token) {
        try {
          console.log('[Auth] Decoding JWT...');
          const secret = process.env.NEXT_PUBLIC_JWT_SECRET || '41d7608f24c106eeab002add62ea7b614173a6a6e9a95eaee7505936d8c51edc';

          const secretKey = new TextEncoder().encode(secret);
          const { payload } = await jwtVerify(token, secretKey);
          console.log('[Auth] Decoded payload:', payload);

          setUser(payload as UserData);
          setContextLoaded(true);

          // Store in sessionStorage for API calls
          sessionStorage.setItem('user_context', JSON.stringify(payload));
          sessionStorage.setItem('auth_token', token);

          // Clean URL (remove token from address bar)
          window.history.replaceState({}, '', window.location.pathname);

          console.log('[Auth] SUCCESS - User authenticated!');
        } catch (err) {
          console.error('[Auth] Failed to decode token:', err);
          // Don't block the app if token is invalid, just log it
          setUser(null);
          setContextLoaded(false);
        }
      } else {
        // Check if user context is already in sessionStorage
        const storedUser = sessionStorage.getItem('user_context');
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            console.log('[Auth] Restored user from sessionStorage');
            setUser(parsedUser);
            setContextLoaded(true);
          } catch (err) {
            console.error('[Auth] Failed to parse stored user:', err);
          }
        }
      }

      setLoading(false);
    };

    loadContext();
  }, [searchParams]);

  return (
    <AuthContext.Provider value={{ user, loading, contextLoaded }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
