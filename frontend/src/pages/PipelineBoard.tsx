import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DealStage, Lead, LeadStage, Opportunity } from '../api/types';
import { listLeads } from '../api/leads';
import { listDeals } from '../api/deals';
import { listStages } from '../api/stages';
import { Icon } from '../components/Icon';
import { SkeletonKanban } from '../components/Skeleton';

async function loadAllLeads(): Promise<Lead[]> {
  let page = 1;
  let all: Lead[] = [];
  for (;;) {
    const data = await listLeads({ page, pageSize: 100 });
    all = all.concat(data.data);
    if (all.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return all;
}

async function loadAllDeals(): Promise<Opportunity[]> {
  let page = 1;
  let all: Opportunity[] = [];
  for (;;) {
    const data = await listDeals({ page, pageSize: 100 });
    all = all.concat(data.data);
    if (all.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return all;
}

function formatValue(value?: string) {
  if (!value) return null;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return null;
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const LEAD_COLUMN_STAGES = ['New', 'Contacted', 'Working'];

interface PipelineColumn {
  id: string;
  label: string;
  leads?: Lead[];
  deals?: Opportunity[];
}

export function PipelineBoard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Opportunity[]>([]);
  const [leadStages, setLeadStages] = useState<LeadStage[]>([]);
  const [dealStages, setDealStages] = useState<DealStage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      loadAllLeads(),
      loadAllDeals(),
      listStages('lead_stages'),
      listStages('deal_stages'),
    ]).then(([leadRows, dealRows, leadStageRes, dealStageRes]) => {
      setLeads(leadRows);
      setDeals(dealRows);
      setLeadStages(leadStageRes as LeadStage[]);
      setDealStages((dealStageRes as DealStage[]).slice().sort((a, b) => a.order - b.order));
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonKanban />;

  const openDealStages = dealStages.filter((s) => !s.isClosedWon && !s.isClosedLost);
  const wonDeals = deals.filter((d) => d.stage.isClosedWon);
  const lostDeals = deals.filter((d) => d.stage.isClosedLost);

  const columns: PipelineColumn[] = [
    {
      id: 'lead',
      label: 'Lead',
      leads: leads.filter((l) => !l.convertedAt && LEAD_COLUMN_STAGES.includes(l.stage.name)),
    },
    {
      id: 'qualified',
      label: 'Qualified',
      leads: leads.filter((l) => !l.convertedAt && l.stage.isWon),
    },
    ...openDealStages.map((stage) => ({
      id: `deal-${stage.id}`,
      label: stage.name,
      deals: deals.filter((d) => d.stage.id === stage.id),
    })),
    { id: 'won', label: 'Won', deals: wonDeals },
    { id: 'lost', label: 'Lost', deals: lostDeals },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Pipeline</h2>
      <p style={{ color: 'var(--muted)', marginTop: -6 }}>
        A read-only view across the full Lead → Deal lifecycle. Click a card to open its record.
      </p>
      <div className="kanban">
        {columns.map((col) => {
          const count = (col.leads?.length ?? 0) + (col.deals?.length ?? 0);
          return (
            <div className="kanban-col" key={col.id}>
              <div className="kanban-col-fixed">
                <h4>{col.label} <span className="count">({count})</span></h4>
              </div>
              <div className="kanban-col-cards">
                {count === 0 && (
                  <div className="kanban-empty">
                    <div className="icon"><Icon name="inbox" size={18} /></div>
                    <p>No records in this stage</p>
                  </div>
                )}
                {col.leads?.map((lead) => {
                  const name = lead.leadName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || 'Untitled lead';
                  return (
                    <Link key={lead.id} to={`/leads/${lead.id}`} className="kanban-card" style={{ display: 'block', cursor: 'pointer' }}>
                      <div className="kanban-card-title">{name}</div>
                      {lead.account?.name && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{lead.account.name}</div>}
                      {formatValue(lead.value) && (
                        <div style={{ marginTop: 10 }}><span className="chip">{formatValue(lead.value)}</span></div>
                      )}
                    </Link>
                  );
                })}
                {col.deals?.map((deal) => (
                  <Link key={deal.id} to={`/deals/${deal.id}`} className="kanban-card" style={{ display: 'block', cursor: 'pointer' }}>
                    <div className="kanban-card-title">{deal.name}</div>
                    {deal.account?.name && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{deal.account.name}</div>}
                    {formatValue(deal.amount) && (
                      <div style={{ marginTop: 10 }}><span className="chip">{formatValue(deal.amount)}</span></div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
