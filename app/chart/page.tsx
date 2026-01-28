import { redirect } from 'next/navigation';
import { DEFAULT_SYMBOL } from '@/lib/symbols';

export default function ChartPage() {
  redirect(`/chart/${DEFAULT_SYMBOL.slug}`);
}
