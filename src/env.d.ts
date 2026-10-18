interface Window {
  __scLoop?: boolean;
  __blogApi?: {
    gateFetch(path: string, options?: RequestInit): Promise<Response | null>;
  };
}

interface WindowEventMap {
  'blog:quote-comment': CustomEvent<{ text: string; returnY: number }>;
}
