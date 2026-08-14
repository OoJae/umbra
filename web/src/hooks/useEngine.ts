'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 10_000 });
}

export function useInfo() {
  return useQuery({ queryKey: ['info'], queryFn: api.info, refetchInterval: 30_000 });
}

export function useAttestation() {
  return useQuery({ queryKey: ['attestation'], queryFn: api.attestation, staleTime: 60_000 });
}

export function useDarkBook(pollMs = 3000) {
  return useQuery({ queryKey: ['book'], queryFn: api.book, refetchInterval: pollMs });
}
