"use client";

import { ArrowsLeftRight, House, ListBullets, SquaresFour } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Customer } from "@/engine";
import { intentCopy } from "./copy";
import { KateMark } from "./Kate";
import { KbcLogo } from "./KbcLogo";

/** S1: a normal KBC Mobile home screen, and Kate's notification sliding in from the top. */
export function HomeScreen({ customer, showNotification, onOpen }: { customer: Customer; showNotification: boolean; onOpen: () => void }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex h-full flex-col">
      <AnimatePresence>
        {showNotification && (
          <motion.button
            key="notif"
            onClick={onOpen}
            initial={reduce ? { opacity: 0 } : { y: "-120%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.45 }}
            className="press absolute inset-x-3 top-1 z-20 flex gap-3 rounded-[18px] bg-white/95 p-3.5 text-left shadow-raised backdrop-blur"
          >
            <KateMark size={36} />
            <span className="min-w-0 flex-1">
              <span className="flex justify-between text-[13px] font-semibold text-night-300">
                <span>Kate · KBC Mobile</span>
                <span>now</span>
              </span>
              <span className="mt-0.5 block text-[15px] font-semibold leading-5 text-night">{intentCopy.notification}</span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <div aria-hidden className="flex-1 px-5">
        <div className="flex items-center justify-between pt-3">
          <KbcLogo size={44} />
          <span className="grid size-10 place-items-center rounded-full bg-white font-bold text-night shadow-card">{customer.name[0]}</span>
        </div>
        <p className="mt-4 text-[28px] font-extrabold leading-8 tracking-[-0.02em]">Good evening, {customer.name}</p>

        <div className="mt-4 flex items-center gap-3 rounded-full bg-white px-4 py-3 text-[15px] text-night-300 shadow-card">
          <KateMark size={22} />
          Ask Kate anything
        </div>

        <div className="mt-6 space-y-3">
          <Account name="Current account" iban="BE68 •••• •••• 4721" amount="€4,218.40" />
          <Account name="Savings account" iban="BE21 •••• •••• 0934" amount="€38,900.00" />
        </div>

        <p className="mt-6 text-[15px] font-bold text-night-300">Recent</p>
        <ul className="mt-2 divide-y divide-night-100/60 rounded-[8px] bg-white px-4 shadow-card">
          <Txn label="Salary" date="Today" amount="+€3,240.00" />
          <Txn label="Delhaize Gent" date="Yesterday" amount="−€42.80" />
          <Txn label="Transfer to savings" date="14 Oct" amount="−€1,500.00" />
        </ul>
      </div>

      <nav aria-hidden className="mb-5 flex justify-around border-t border-night-100/60 bg-white pt-2 pb-3 text-[11px] font-semibold text-night-300">
        <Tab icon={<House size={24} weight="fill" />} label="Home" active />
        <Tab icon={<ArrowsLeftRight size={24} />} label="Payments" />
        <Tab icon={<SquaresFour size={24} />} label="Products" />
        <Tab icon={<ListBullets size={24} />} label="More" />
      </nav>
    </div>
  );
}

function Account({ name, iban, amount }: { name: string; iban: string; amount: string }) {
  return (
    <div className="rounded-[8px] bg-white p-4 shadow-card">
      <p className="text-[15px] font-semibold">{name}</p>
      <p className="text-[13px] text-night-300">{iban}</p>
      <p className="tabular mt-2 text-[22px] font-bold">{amount}</p>
    </div>
  );
}

function Txn({ label, date, amount }: { label: string; date: string; amount: string }) {
  return (
    <li className="flex items-center justify-between py-3">
      <span>
        <span className="block text-[15px] font-semibold">{label}</span>
        <span className="text-[13px] text-night-300">{date}</span>
      </span>
      <span className="tabular text-[15px] font-bold">{amount}</span>
    </li>
  );
}

function Tab({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <span className={`flex flex-col items-center gap-0.5 ${active ? "text-accent-600" : ""}`}>
      {icon}
      {label}
    </span>
  );
}
