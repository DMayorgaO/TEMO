import type { ReactNode } from 'react';

type MetricCardProps = {
  label: string;
  value: string;
  helper: string;
  icon: ReactNode;
};

export function MetricCard({ label, value, helper, icon }: MetricCardProps) {
  return (
    // Tarjeta reutilizable para mostrar indicadores resumidos del negocio.
    <article className="metric-card">
      <div className="metric-card__icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{helper}</span>
      </div>
    </article>
  );
}
