/**
 * Client-side authenticated fetch utility
 * Automatically adds JWT token from sessionStorage to request headers
 */

/**
 * Performs an authenticated fetch request
 * Automatically adds the JWT token from sessionStorage to headers
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch options
 * @returns Fetch response
 */
export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // Get token from sessionStorage
  const token = sessionStorage.getItem('auth_token');

  if (!token) {
    throw new Error('No authentication token found. Please log in.');
  }

  // Merge headers with auth token
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);

  // Perform fetch with authentication
  return fetch(url, {
    ...options,
    headers
  });
}

/**
 * Convenience function for authenticated POST requests
 */
export async function authenticatedPost(url: string, body: any): Promise<Response> {
  return authenticatedFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

/**
 * Convenience function for authenticated GET requests
 */
export async function authenticatedGet(url: string): Promise<Response> {
  return authenticatedFetch(url, {
    method: 'GET'
  });
}
