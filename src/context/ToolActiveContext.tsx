import { createContext, useContext } from 'react';

export const ToolActiveContext = createContext(true);

export function useToolActive(): boolean {
  return useContext(ToolActiveContext);
}
