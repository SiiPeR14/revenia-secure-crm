import type {Metadata} from 'next';
import {MarketingSite} from '@/components/marketing-site';
import './marketing.css';
export const metadata:Metadata={title:'Revenia — Facturas, cobros y automatización',description:'Controla facturas, prepara el seguimiento de cobros y recupera presupuestos con Revenia. Explora los servicios y planes.',robots:{index:false,follow:false}};
export default function HomePage(){return <MarketingSite/>;}
import './marketing-invoices.css';
