"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { ProtectedPage } from "@/components/ProtectedPage";
import { PaginationControls } from "@/components/PaginationControls";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { buildOrderPermissionAccess, hasOrderLaneAccess } from "@/lib/orderAccess";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";

const PAGE_SIZE = 25;
const TASK_BUCKET_PAGE_SIZE = 10;

type Lane = "processing" | "packaging" | "shipping" | "cancellations";

type PendingHandover = {
  type?: string;
  status?: string;
  fromOwner?: string;
  toOwner?: string;
  handedOverBy?: string;
  handedOverAt?: string | null;
  rejectionReason?: string;
} | null;

type OrderItemDoc = {
  id: string;
  title: string;
  slug?: string;
  stockKey?: string;
  quantity: number;
  fulfillmentStatus?: string;
  physicalOwner?: string;
  currentLaneOwner?: string;
  currentStage?: string;
  customerOrderedDate?: string | null;
  targetCompletionDate?: string | null;
  laneAssignedAt?: string | null;
  lastActionedAt?: string | null;
  slaStatus?: string;
  hoursInLane?: number;
  packageVerificationStatus?: string;
  labelStatus?: string;
  labelReprintCount?: number;
  labelReprintReason?: string;
  courierName?: string;
  outboundTrackingNumber?: string;
  cancellationSource?: string;
  cancellationReason?: string;
  cancelRequestedAt?: string | null;
  pickedAt?: string | null;
  handedToPackagingAt?: string | null;
  packagingReceivedAt?: string | null;
  packagingStartedAt?: string | null;
  packageVerifiedAt?: string | null;
  labelPrintedAt?: string | null;
  packedAt?: string | null;
  handedToShippingAt?: string | null;
  shippingReceivedAt?: string | null;
  shippingStartedAt?: string | null;
  trackingNumberEnteredAt?: string | null;
  shippedAt?: string | null;
  cancellationReceivedAt?: string | null;
  cancellationClosedAt?: string | null;
  lineGrandTotal?: number;
  lineTotal?: number;
  pendingHandover?: PendingHandover;
};

type AddressSnapshot = {
  fullName?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

type OrderDoc = {
  id: string;
  displayId?: string;
  placedAt?: string;
  status: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  itemCount: number;
  subtotal?: number;
  discountTotal?: number;
  shippingTotal?: number;
  taxTotal?: number;
  taxableBaseTotal?: number;
  grandTotal?: number;
  total: number;
  paymentReference?: string;
  pricingSnapshot?: {
    includedTaxTotal?: number;
  } | null;
  addressSnapshot?: AddressSnapshot | null;
  items: OrderItemDoc[];
};

type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type OrdersWorkspaceProps = {
  title: string;
  subtitle: string;
  lane: Lane;
  backHref?: string;
  backLabel?: string;
  requiredAnyOf?: string[];
};

type LaneTaskBucketKey = string;

type LaneTaskEntry = {
  key: string;
  order: OrderDoc;
  item: OrderItemDoc;
  status: string;
  needsAttention: boolean;
  hint?: string;
};

type LaneTaskBucket = {
  key: LaneTaskBucketKey;
  label: string;
  printLabel: string;
  printTitle: string;
  requiresSignature: boolean;
  entries: LaneTaskEntry[];
};

type LaneTaskBoard = {
  managerLabel: string;
  title: string;
  subtitle: string;
  summary: Array<{ label: string; count: number }>;
  buckets: LaneTaskBucket[];
  overdueCount: number;
  cancellationCount: number;
};

type PackagingModalState = {
  orderId: string;
  itemId: string;
} | null;

type ShippingModalState = {
  orderId: string;
  itemId: string;
  courierName: string;
  trackingNumber: string;
  formError: string;
} | null;

const LANE_ENDPOINTS: Record<Lane, string> = {
  processing: "/api/admin/orders/processing/picking-queue",
  packaging: "/api/admin/orders/packaging/receipt-queue",
  shipping: "/api/admin/orders/shipping/receipt-queue",
  cancellations: "/api/admin/orders/cancellations/pending",
};

const DEFAULT_REQUIRED: Record<Lane, string[]> = {
  processing: ["order:processing"],
  packaging: ["order:packaging"],
  shipping: ["order:shipping"],
  cancellations: ["order:cancellation"],
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function orderDisplayId(order: Pick<OrderDoc, "id" | "displayId">) {
  return order.displayId || `#${String(order.id || "").slice(-6).toUpperCase()}`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function isAttentionSla(status?: string) {
  return ["DELAYED", "VIOLATED"].includes(String(status || "").toUpperCase());
}

function statusLabel(status?: string) {
  if (!status) return "-";
  return ADMIN_UI_STRINGS.orders.states[status as keyof typeof ADMIN_UI_STRINGS.orders.states] || status;
}

function paymentLabel(status?: string) {
  if (!status) return ADMIN_UI_STRINGS.orders.paymentStates.paid;
  return ADMIN_UI_STRINGS.orders.paymentStates[
    status as keyof typeof ADMIN_UI_STRINGS.orders.paymentStates
  ] || status;
}

function getOrderAmount(order: OrderDoc) {
  return Number(order.grandTotal ?? order.total ?? 0);
}

function getItemAmount(item: OrderItemDoc) {
  return Number(item.lineGrandTotal ?? item.lineTotal ?? 0);
}

function joinAddress(address?: AddressSnapshot | null) {
  if (!address) return [];
  return [
    address.fullName,
    [address.line1, address.line2].filter(Boolean).join(", "),
    [address.city, address.state, address.postalCode].filter(Boolean).join(", "),
    address.country,
    address.phone,
  ].filter(Boolean) as string[];
}

function getLaneDescription(lane: Lane, item: OrderItemDoc) {
  const status = String(item.fulfillmentStatus || "").toUpperCase();
  const owner = String(item.physicalOwner || "").toUpperCase();
  const pendingType = String(item.pendingHandover?.type || "").toUpperCase();
  const pendingStatus = String(item.pendingHandover?.status || "").toUpperCase();

  if (lane === "processing") {
    if (status === "RESERVED") return "Ready to pick from warehouse.";
    if (status === "PICKED_FROM_WAREHOUSE") return "Picked and awaiting handover to packaging.";
    if (status === "HANDED_TO_PACKAGING" && pendingType === "PROCESSING_TO_PACKAGING") return "Waiting for packaging to confirm receipt.";
    if (status === "CANCEL_REQUESTED" && owner === "PROCESSING_MANAGER") {
      return "Customer cancellation requested. Processing owns the picked item and must hand it to the cancellation manager.";
    }
  }

  if (lane === "packaging") {
    if (status === "HANDED_TO_PACKAGING") return "Packaging can confirm or reject this handover.";
    if (status === "PACKAGING_RECEIVED") return "Ready to start packaging.";
    if (status === "PACKAGING_IN_PROGRESS") return "Verify the package, print label, and mark it packed.";
    if (status === "PACKED") return "Ready to hand over to shipping.";
    if (status === "HANDED_TO_SHIPPING" && pendingType === "PACKAGING_TO_SHIPPING") return "Waiting for shipping to confirm receipt.";
    if (status === "CANCEL_REQUESTED" && owner === "PACKAGING_MANAGER") {
      return pendingType === "PACKAGING_TO_SHIPPING" && pendingStatus === "REJECTED"
        ? "Shipping rejected receipt after cancellation. Packaging owns this item and must hand it to the cancellation manager."
        : "Customer cancellation requested. Packaging owns this item and must hand it to the cancellation manager.";
    }
  }

  if (lane === "shipping") {
    if (status === "HANDED_TO_SHIPPING") return "Shipping can confirm or reject this handover.";
    if (status === "SHIPPING_RECEIVED") return "Ready to start shipping.";
    if (status === "SHIPPING_IN_PROGRESS") return "Assign courier, enter tracking, and mark shipped.";
    if (status === "CANCEL_REQUESTED" && pendingType === "PACKAGING_TO_SHIPPING" && pendingStatus === "PENDING_RECEIPT") {
      return "Customer cancellation requested during shipping handover. Shipping must confirm or reject receipt first.";
    }
    if (status === "CANCEL_REQUESTED" && owner === "SHIPPING_OPERATOR") {
      return "Customer cancellation requested. Shipping received the item and must hand it to the cancellation manager.";
    }
  }

  if (lane === "cancellations") {
    if (status === "CANCEL_REQUESTED") return "Pending handover into the cancellation lane.";
    if (status === "HANDED_TO_CANCELLATION") return "Waiting for cancellation receipt confirmation.";
    if (status === "CANCELLATION_RECEIVED") return "Resolve the cancelled item as restocked, damaged, or lost.";
  }

  return "";
}

function getTimeline(item: OrderItemDoc) {
  const events = [
    ["Picked", item.pickedAt],
    ["Handed to packaging", item.handedToPackagingAt],
    ["Packaging received", item.packagingReceivedAt],
    ["Packaging started", item.packagingStartedAt],
    ["Package verified", item.packageVerifiedAt],
    ["Label printed", item.labelPrintedAt],
    ["Packed", item.packedAt],
    ["Handed to shipping", item.handedToShippingAt],
    ["Shipping received", item.shippingReceivedAt],
    ["Shipping started", item.shippingStartedAt],
    ["Tracking entered", item.trackingNumberEnteredAt],
    ["Shipped", item.shippedAt],
    ["Cancellation received", item.cancellationReceivedAt],
    ["Cancellation closed", item.cancellationClosedAt],
  ].filter(([, value]) => !!value);

  return events as Array<[string, string]>;
}

function findOrderItem(orders: OrderDoc[], orderId: string, itemId: string) {
  const order = orders.find((entry) => entry.id === orderId) || null;
  const item = order?.items.find((entry) => entry.id === itemId) || null;
  return order && item ? { order, item } : null;
}

function buildOrderItemKey(orderId: string, itemId: string) {
  return `${orderId}:${itemId}`;
}

function summarizeLaneItems(items: OrderItemDoc[]) {
  if (!items.length) return "No active lane items";
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = statusLabel(item.fulfillmentStatus);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([label, count]) => `${count} ${label}`)
    .join(" • ");
}

function isOverdueLaneItem(item: OrderItemDoc, order: OrderDoc, now = new Date()) {
  const targetDate = item.targetCompletionDate ? new Date(item.targetCompletionDate) : null;
  return isAttentionSla(item.slaStatus) || (!!targetDate && !Number.isNaN(targetDate.getTime()) && targetDate.getTime() < now.getTime());
}

function isLaneProcessedItem(lane: Lane, item: OrderItemDoc) {
  const status = String(item.fulfillmentStatus || "").toUpperCase();

  if (lane === "processing") {
    return !!(item.pickedAt || item.handedToPackagingAt) &&
      !["RESERVED", "PICKED_FROM_WAREHOUSE", "HANDED_TO_PACKAGING", "CANCEL_REQUESTED"].includes(status);
  }

  if (lane === "packaging") {
    return !!(item.packagingReceivedAt || item.packagingStartedAt || item.packedAt || item.handedToShippingAt) &&
      !["HANDED_TO_PACKAGING", "PACKAGING_RECEIVED", "PACKAGING_IN_PROGRESS", "PACKED", "CANCEL_REQUESTED"].includes(status);
  }

  if (lane === "shipping") {
    return status === "SHIPPED" || status === "DELIVERED" || !!item.shippedAt;
  }

  return false;
}

function sortLaneEntries(entries: LaneTaskEntry[]) {
  return entries.sort((left, right) => {
    const leftTime = new Date(left.item.targetCompletionDate || left.order.placedAt || 0).getTime();
    const rightTime = new Date(right.item.targetCompletionDate || right.order.placedAt || 0).getTime();
    return leftTime - rightTime;
  });
}

function getLaneTaskBoard(lane: Lane, orders: OrderDoc[]): LaneTaskBoard | null {
  if (!["processing", "packaging", "shipping"].includes(lane)) return null;

  const today = new Date();
  let overdueCount = 0;
  let cancellationCount = 0;

  const pendingPicking: LaneTaskEntry[] = [];
  const processingReady: LaneTaskEntry[] = [];
  const processingCancellations: LaneTaskEntry[] = [];
  const processingProcessed: LaneTaskEntry[] = [];
  const pendingPackaging: LaneTaskEntry[] = [];
  const packagingReady: LaneTaskEntry[] = [];
  const packagingCancellations: LaneTaskEntry[] = [];
  const packagingProcessed: LaneTaskEntry[] = [];
  const pendingShipping: LaneTaskEntry[] = [];
  const shippingCompleted: LaneTaskEntry[] = [];
  const shippingCancellations: LaneTaskEntry[] = [];

  for (const order of orders) {
    for (const item of order.items) {
      const status = String(item.fulfillmentStatus || "").toUpperCase();
      const owner = String(item.physicalOwner || "").toUpperCase();
      const pendingType = String(item.pendingHandover?.type || "").toUpperCase();
      const pendingStatus = String(item.pendingHandover?.status || "").toUpperCase();
      const needsAttention = isOverdueLaneItem(item, order, today);
      if (needsAttention) overdueCount += 1;

      const entry = (hint = ""): LaneTaskEntry => ({
        key: buildOrderItemKey(order.id, item.id),
        order,
        item,
        status,
        needsAttention,
        hint,
      });

      if (lane === "processing") {
        if (isLaneProcessedItem(lane, item)) {
          processingProcessed.push(entry(ADMIN_UI_STRINGS.orders.processingProcessedHint));
          continue;
        }

        if (status === "RESERVED") {
          pendingPicking.push(entry());
          continue;
        }

        if (status === "PICKED_FROM_WAREHOUSE") {
          processingReady.push(entry());
          continue;
        }

        if (status === "HANDED_TO_PACKAGING" && owner === "PROCESSING_MANAGER") {
          processingReady.push(entry(ADMIN_UI_STRINGS.orders.processingAwaitingReceiptHint));
          continue;
        }

        if (status === "CANCEL_REQUESTED" && owner === "PROCESSING_MANAGER") {
          cancellationCount += 1;
          processingCancellations.push({
            ...entry(ADMIN_UI_STRINGS.orders.cancellationRequestedHint),
            needsAttention: true,
          });
        }
        continue;
      }

      if (lane === "packaging") {
        if (isLaneProcessedItem(lane, item)) {
          packagingProcessed.push(entry(ADMIN_UI_STRINGS.orders.packagingProcessedHint));
          continue;
        }

        if (["HANDED_TO_PACKAGING", "PACKAGING_RECEIVED", "PACKAGING_IN_PROGRESS"].includes(status)) {
          const hint = status === "HANDED_TO_PACKAGING"
            ? ADMIN_UI_STRINGS.orders.packagingAwaitingReceiptHint
            : status === "PACKAGING_RECEIVED"
              ? ADMIN_UI_STRINGS.orders.packagingPendingWorkHint
              : ADMIN_UI_STRINGS.orders.packagingInProgressHint;
          pendingPackaging.push(entry(hint));
          continue;
        }

        if (status === "PACKED") {
          packagingReady.push(entry(ADMIN_UI_STRINGS.orders.packagingReadyForShippingHint));
          continue;
        }

        if (
          status === "CANCEL_REQUESTED" &&
          owner === "PACKAGING_MANAGER" &&
          !(pendingType === "PACKAGING_TO_SHIPPING" && pendingStatus === "PENDING_RECEIPT")
        ) {
          cancellationCount += 1;
          packagingCancellations.push({
            ...entry(ADMIN_UI_STRINGS.orders.cancellationRequestedHint),
            needsAttention: true,
          });
        }
        continue;
      }

      if (lane === "shipping") {
        if (isLaneProcessedItem(lane, item)) {
          shippingCompleted.push(entry(ADMIN_UI_STRINGS.orders.shippingCompletedHint));
          continue;
        }

        if (["HANDED_TO_SHIPPING", "SHIPPING_RECEIVED", "SHIPPING_IN_PROGRESS"].includes(status)) {
          const hint = status === "HANDED_TO_SHIPPING"
            ? ADMIN_UI_STRINGS.orders.shippingAwaitingReceiptHint
            : status === "SHIPPING_RECEIVED"
              ? ADMIN_UI_STRINGS.orders.shippingPendingWorkHint
              : ADMIN_UI_STRINGS.orders.shippingInProgressHint;
          pendingShipping.push(entry(hint));
          continue;
        }

        if (
          status === "CANCEL_REQUESTED" &&
          (
            owner === "SHIPPING_OPERATOR" ||
            (pendingType === "PACKAGING_TO_SHIPPING" && pendingStatus === "PENDING_RECEIPT")
          )
        ) {
          cancellationCount += 1;
          const hint = pendingType === "PACKAGING_TO_SHIPPING" && pendingStatus === "PENDING_RECEIPT"
            ? ADMIN_UI_STRINGS.orders.shippingCancellationPendingReceiptHint
            : ADMIN_UI_STRINGS.orders.cancellationRequestedHint;
          shippingCancellations.push({
            ...entry(hint),
            needsAttention: true,
          });
        }
      }
    }
  }

  if (lane === "processing") {
    return {
      managerLabel: ADMIN_UI_STRINGS.menu.processingManager,
      title: ADMIN_UI_STRINGS.orders.processingTaskBoardTitle,
      subtitle: ADMIN_UI_STRINGS.orders.processingTaskBoardSubtitle,
      summary: [
        { label: ADMIN_UI_STRINGS.orders.processingPendingSection, count: pendingPicking.length },
        { label: ADMIN_UI_STRINGS.orders.processingReadySection, count: processingReady.length },
        { label: ADMIN_UI_STRINGS.orders.processingAttentionSection, count: overdueCount },
        { label: ADMIN_UI_STRINGS.orders.processingProcessedSection, count: processingProcessed.length },
        { label: ADMIN_UI_STRINGS.orders.processingCancellationSection, count: processingCancellations.length },
      ],
      buckets: [
        {
          key: "processing_pending_picking",
          label: ADMIN_UI_STRINGS.orders.processingPendingSection,
          printLabel: ADMIN_UI_STRINGS.orders.processingPrintPickList,
          printTitle: ADMIN_UI_STRINGS.orders.processingPickListTitle,
          requiresSignature: false,
          entries: sortLaneEntries(pendingPicking),
        },
        {
          key: "processing_ready_handover",
          label: ADMIN_UI_STRINGS.orders.processingReadySection,
          printLabel: ADMIN_UI_STRINGS.orders.processingPrintHandoverList,
          printTitle: ADMIN_UI_STRINGS.orders.processingHandoverListTitle,
          requiresSignature: true,
          entries: sortLaneEntries(processingReady),
        },
        {
          key: "processing_cancellation_requested",
          label: ADMIN_UI_STRINGS.orders.processingCancellationSection,
          printLabel: ADMIN_UI_STRINGS.orders.processingPrintCancellationList,
          printTitle: ADMIN_UI_STRINGS.orders.processingCancellationListTitle,
          requiresSignature: false,
          entries: sortLaneEntries(processingCancellations),
        },
        {
          key: "processing_processed_orders",
          label: ADMIN_UI_STRINGS.orders.processingProcessedSection,
          printLabel: ADMIN_UI_STRINGS.orders.processingPrintProcessedList,
          printTitle: ADMIN_UI_STRINGS.orders.processingProcessedListTitle,
          requiresSignature: false,
          entries: sortLaneEntries(processingProcessed),
        },
      ],
      overdueCount,
      cancellationCount,
    };
  }

  if (lane === "packaging") {
    return {
      managerLabel: ADMIN_UI_STRINGS.menu.packagingManager,
      title: ADMIN_UI_STRINGS.orders.packagingTaskBoardTitle,
      subtitle: ADMIN_UI_STRINGS.orders.packagingTaskBoardSubtitle,
      summary: [
        { label: ADMIN_UI_STRINGS.orders.packagingPendingSection, count: pendingPackaging.length },
        { label: ADMIN_UI_STRINGS.orders.packagingReadySection, count: packagingReady.length },
        { label: ADMIN_UI_STRINGS.orders.processingAttentionSection, count: overdueCount },
        { label: ADMIN_UI_STRINGS.orders.packagingProcessedSection, count: packagingProcessed.length },
        { label: ADMIN_UI_STRINGS.orders.packagingCancellationSection, count: packagingCancellations.length },
      ],
      buckets: [
        {
          key: "packaging_pending_work",
          label: ADMIN_UI_STRINGS.orders.packagingPendingSection,
          printLabel: ADMIN_UI_STRINGS.orders.packagingPrintWorkList,
          printTitle: ADMIN_UI_STRINGS.orders.packagingWorkListTitle,
          requiresSignature: false,
          entries: sortLaneEntries(pendingPackaging),
        },
        {
          key: "packaging_ready_handover",
          label: ADMIN_UI_STRINGS.orders.packagingReadySection,
          printLabel: ADMIN_UI_STRINGS.orders.packagingPrintHandoverList,
          printTitle: ADMIN_UI_STRINGS.orders.packagingHandoverListTitle,
          requiresSignature: true,
          entries: sortLaneEntries(packagingReady),
        },
        {
          key: "packaging_cancellation_requested",
          label: ADMIN_UI_STRINGS.orders.packagingCancellationSection,
          printLabel: ADMIN_UI_STRINGS.orders.packagingPrintCancellationList,
          printTitle: ADMIN_UI_STRINGS.orders.packagingCancellationListTitle,
          requiresSignature: false,
          entries: sortLaneEntries(packagingCancellations),
        },
        {
          key: "packaging_processed_orders",
          label: ADMIN_UI_STRINGS.orders.packagingProcessedSection,
          printLabel: ADMIN_UI_STRINGS.orders.packagingPrintProcessedList,
          printTitle: ADMIN_UI_STRINGS.orders.packagingProcessedListTitle,
          requiresSignature: false,
          entries: sortLaneEntries(packagingProcessed),
        },
      ],
      overdueCount,
      cancellationCount,
    };
  }

  return {
    managerLabel: ADMIN_UI_STRINGS.menu.shippingOperator,
    title: ADMIN_UI_STRINGS.orders.shippingTaskBoardTitle,
    subtitle: ADMIN_UI_STRINGS.orders.shippingTaskBoardSubtitle,
    summary: [
      { label: ADMIN_UI_STRINGS.orders.shippingPendingSection, count: pendingShipping.length },
      { label: ADMIN_UI_STRINGS.orders.shippingCompletedSection, count: shippingCompleted.length },
      { label: ADMIN_UI_STRINGS.orders.processingAttentionSection, count: overdueCount },
      { label: ADMIN_UI_STRINGS.orders.shippingCancellationSection, count: shippingCancellations.length },
    ],
    buckets: [
      {
        key: "shipping_pending_work",
        label: ADMIN_UI_STRINGS.orders.shippingPendingSection,
        printLabel: ADMIN_UI_STRINGS.orders.shippingPrintWorkList,
        printTitle: ADMIN_UI_STRINGS.orders.shippingWorkListTitle,
        requiresSignature: false,
        entries: sortLaneEntries(pendingShipping),
      },
      {
        key: "shipping_completed_dispatch",
        label: ADMIN_UI_STRINGS.orders.shippingCompletedSection,
        printLabel: ADMIN_UI_STRINGS.orders.shippingPrintDispatchList,
        printTitle: ADMIN_UI_STRINGS.orders.shippingDispatchListTitle,
        requiresSignature: true,
        entries: sortLaneEntries(shippingCompleted),
      },
      {
        key: "shipping_cancellation_requested",
        label: ADMIN_UI_STRINGS.orders.shippingCancellationSection,
        printLabel: ADMIN_UI_STRINGS.orders.shippingPrintCancellationList,
        printTitle: ADMIN_UI_STRINGS.orders.shippingCancellationListTitle,
        requiresSignature: false,
        entries: sortLaneEntries(shippingCancellations),
      },
    ],
    overdueCount,
    cancellationCount,
  };
}

export function OrdersWorkspace({
  title,
  subtitle,
  lane,
  backHref = "/admin/orders/dashboard",
  backLabel = ADMIN_UI_STRINGS.orders.backToDashboard,
  requiredAnyOf,
}: OrdersWorkspaceProps) {
  const { accessToken, refreshAccessToken, me } = useAuth();
  const permissions = me?.permissions || [];
  const systemLevel = String(me?.systemLevel || me?.user?.systemLevel || "NONE").toUpperCase();
  const orderAccess = useMemo(
    () => buildOrderPermissionAccess(permissions, systemLevel),
    [permissions, systemLevel]
  );
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [stockKeyInput, setStockKeyInput] = useState("");
  const [stockKey, setStockKey] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [actionBusyKey, setActionBusyKey] = useState("");
  const [selectedPrintKeys, setSelectedPrintKeys] = useState<string[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [bucketPages, setBucketPages] = useState<Record<string, number>>({});
  const [activePrintBucketKey, setActivePrintBucketKey] = useState("");
  const [expandedTaskDetailKey, setExpandedTaskDetailKey] = useState("");
  const [packagingModalState, setPackagingModalState] = useState<PackagingModalState>(null);
  const [shippingModalState, setShippingModalState] = useState<ShippingModalState>(null);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || orders[0] || null,
    [orders, selectedOrderId]
  );
  const taskBoard = useMemo(
    () => getLaneTaskBoard(lane, orders),
    [lane, orders]
  );
  const printableEntries = useMemo(
    () => (taskBoard?.buckets || []).flatMap((bucket) => bucket.entries.map(({ order, item, key }) => ({ key, order, item, bucketKey: bucket.key }))),
    [taskBoard]
  );
  const selectedPrintableEntries = useMemo(() => {
    const selectedKeys = new Set(selectedPrintKeys);
    return printableEntries.filter(({ key }) => selectedKeys.has(key));
  }, [printableEntries, selectedPrintKeys]);
  const activePrintBucket = useMemo(
    () => taskBoard?.buckets.find((bucket) => bucket.key === activePrintBucketKey) || null,
    [taskBoard, activePrintBucketKey]
  );
  const packagingModalEntry = useMemo(
    () => packagingModalState ? findOrderItem(orders, packagingModalState.orderId, packagingModalState.itemId) : null,
    [orders, packagingModalState]
  );
  const shippingModalEntry = useMemo(
    () => shippingModalState ? findOrderItem(orders, shippingModalState.orderId, shippingModalState.itemId) : null,
    [orders, shippingModalState]
  );

  const load = async (preferredOrderId = "") => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (stockKey) params.set("stockKey", stockKey);
      if (["processing", "packaging", "shipping"].includes(lane)) params.set("includeCompleted", "1");
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));

      const payload = await apiRequest<PaginatedResponse<OrderDoc>>(
        `${LANE_ENDPOINTS[lane]}${params.toString() ? `?${params.toString()}` : ""}`,
        {
          token: accessToken,
          onUnauthorized: refreshAccessToken,
        }
      );

      const nextOrders = payload?.items || [];
      setOrders(nextOrders);
      setTotal(Number(payload?.total || 0));
      setTotalPages(Math.max(1, Number(payload?.totalPages || 1)));
      setError("");
      setActionError("");
      setSelectedOrderId((current) => {
        const candidate = preferredOrderId || current;
        if (candidate && nextOrders.some((order) => order.id === candidate)) return candidate;
        return nextOrders[0]?.id || "";
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextSearch = searchInput.trim();
      const nextStockKey = stockKeyInput.trim().toUpperCase();
      setSearch((current) => current === nextSearch ? current : nextSearch);
      setStockKey((current) => current === nextStockKey ? current : nextStockKey);
      setPage(1);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchInput, stockKeyInput]);

  useEffect(() => {
    if (!hasOrderLaneAccess(orderAccess, lane)) return;
    load();
  }, [lane, page, search, stockKey, accessToken, orderAccess]);

  useEffect(() => {
    const bucketKeys = new Set((taskBoard?.buckets || []).map((bucket) => bucket.key));
    setCollapsedSections((current) => {
      const next: Record<string, boolean> = {};
      for (const key of bucketKeys) next[key] = current[key] ?? true;
      return next;
    });
    setBucketPages((current) => {
      const next: Record<string, number> = {};
      for (const bucket of taskBoard?.buckets || []) {
        const maxPage = Math.max(1, Math.ceil(bucket.entries.length / TASK_BUCKET_PAGE_SIZE));
        next[bucket.key] = Math.min(Math.max(1, current[bucket.key] || 1), maxPage);
      }
      return next;
    });
  }, [taskBoard]);

  useEffect(() => {
    const availableKeys = new Set(
      printableEntries.map(({ key }) => key)
    );
    setSelectedPrintKeys((current) => current.filter((key) => availableKeys.has(key)));
    setExpandedTaskDetailKey((current) => current && availableKeys.has(current) ? current : "");
  }, [printableEntries]);

  useEffect(() => {
    if (!packagingModalState) return;
    const current = packagingModalEntry;
    const status = String(current?.item.fulfillmentStatus || "").toUpperCase();
    if (!current || !["PACKAGING_IN_PROGRESS", "PACKAGING_RECEIVED"].includes(status)) {
      setPackagingModalState(null);
    }
  }, [packagingModalEntry, packagingModalState]);

  useEffect(() => {
    if (!shippingModalState) return;
    const current = shippingModalEntry;
    const status = String(current?.item.fulfillmentStatus || "").toUpperCase();
    if (!current || !["SHIPPING_RECEIVED", "SHIPPING_IN_PROGRESS"].includes(status)) {
      setShippingModalState(null);
    }
  }, [shippingModalEntry, shippingModalState]);

  const performAction = async (
    orderId: string,
    itemId: string,
    endpoint: string,
    body?: Record<string, unknown>,
    options?: { confirmMessage?: string; afterSuccess?: () => void; successMessage?: string; preferredOrderId?: string }
  ) => {
    if (actionBusyKey) return;
    if (options?.confirmMessage && !window.confirm(options.confirmMessage)) return;

    setActionBusyKey(`${itemId}:${endpoint}`);
    setActionError("");
    setActionSuccess("");
    try {
      const currentItem = orders
        .find((order) => order.id === orderId)
        ?.items.find((entry) => entry.id === itemId);
      const requestBody = currentItem
        ? { ...(body || {}), expectedStatus: currentItem.fulfillmentStatus }
        : body;
      await apiRequest<{ order: OrderDoc }>(endpoint, {
        method: "POST",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
        body: requestBody,
      });
      if (options?.successMessage) setActionSuccess(options.successMessage);
      options?.afterSuccess?.();
      await load(options?.preferredOrderId || orderId);
      return true;
    } catch (err) {
      setActionError((err as Error).message);
      return false;
    } finally {
      setActionBusyKey("");
    }
  };

  const openLabelPreview = (orderId: string, itemId: string) => {
    window.open(`/admin/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/label`, "_blank", "noopener,noreferrer");
  };

  const openPackagingModal = async (orderId: string, itemId: string) => {
    const current = findOrderItem(orders, orderId, itemId);
    if (!current) return;
    const status = String(current.item.fulfillmentStatus || "").toUpperCase();

    if (status === "PACKAGING_RECEIVED") {
      const started = await performAction(
        orderId,
        itemId,
        `/api/admin/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/start-packaging`,
        undefined,
        { successMessage: ADMIN_UI_STRINGS.orders.packagingStartedSuccess }
      );
      if (!started) return;
    }

    setPackagingModalState({ orderId, itemId });
  };

  const openShippingModal = (orderId: string, itemId: string) => {
    const current = findOrderItem(orders, orderId, itemId);
    if (!current) return;
    setShippingModalState({
      orderId,
      itemId,
      courierName: current.item.courierName || "",
      trackingNumber: current.item.outboundTrackingNumber || "",
      formError: "",
    });
  };

  const togglePrintSelection = (orderId: string, itemId: string) => {
    const key = buildOrderItemKey(orderId, itemId);
    setSelectedPrintKeys((current) => current.includes(key)
      ? current.filter((entry) => entry !== key)
      : [...current, key]);
  };

  const getBucketSelectedEntries = (bucket: LaneTaskBucket) => {
    const selectedKeys = new Set(selectedPrintKeys);
    return bucket.entries.filter((entry) => selectedKeys.has(entry.key));
  };

  const getEffectiveBucketPrintEntries = (bucket: LaneTaskBucket) => {
    const selectedEntries = getBucketSelectedEntries(bucket);
    return selectedEntries.length ? selectedEntries : bucket.entries;
  };

  const toggleSelectAllBucket = (bucket: LaneTaskBucket) => {
    const bucketKeys = bucket.entries.map((entry) => entry.key);
    const bucketKeySet = new Set(bucketKeys);
    setSelectedPrintKeys((current) => {
      const allSelected = bucketKeys.length > 0 && bucketKeys.every((key) => current.includes(key));
      if (allSelected) return current.filter((key) => !bucketKeySet.has(key));
      return Array.from(new Set([...current, ...bucketKeys]));
    });
  };

  const toggleSection = (section: LaneTaskBucketKey) => {
    setCollapsedSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const setBucketPage = (bucketKey: string, pageUpdater: (current: number) => number) => {
    setBucketPages((current) => ({
      ...current,
      [bucketKey]: pageUpdater(current[bucketKey] || 1),
    }));
  };

  const toggleTaskDetails = (orderId: string, itemId: string) => {
    const key = buildOrderItemKey(orderId, itemId);
    setSelectedOrderId(orderId);
    setExpandedTaskDetailKey((current) => current === key ? "" : key);
  };

  const triggerBucketPrint = (bucket: LaneTaskBucket) => {
    if (!getEffectiveBucketPrintEntries(bucket).length) return;
    flushSync(() => setActivePrintBucketKey(bucket.key));
    window.print();
  };

  const renderInlineOrderDetails = (order: OrderDoc, item: OrderItemDoc) => (
    <div className="processing-task-row__details">
      <div className="processing-task-row__detail-grid">
        <div>
          <span>{ADMIN_UI_STRINGS.orders.orderIdLabel}</span>
          <strong>{orderDisplayId(order)}</strong>
        </div>
        <div>
          <span>{ADMIN_UI_STRINGS.orders.productNameLabel}</span>
          <strong>{item.title}</strong>
        </div>
        <div>
          <span>{ADMIN_UI_STRINGS.orders.stockKeyLabel}</span>
          <strong>{item.stockKey || "-"}</strong>
        </div>
        <div>
          <span>{ADMIN_UI_STRINGS.orders.itemQuantityLabel}</span>
          <strong>{item.quantity}</strong>
        </div>
        <div>
          <span>{ADMIN_UI_STRINGS.orders.itemStateLabel}</span>
          <strong>{statusLabel(item.fulfillmentStatus)}</strong>
        </div>
        <div>
          <span>{ADMIN_UI_STRINGS.orders.physicalOwnerLabel}</span>
          <strong>{item.physicalOwner || "-"}</strong>
        </div>
        <div>
          <span>{ADMIN_UI_STRINGS.orders.customerOrderedDateLabel}</span>
          <strong>{formatDate(item.customerOrderedDate || order.placedAt)}</strong>
        </div>
        <div>
          <span>{ADMIN_UI_STRINGS.orders.targetCompletionDateLabel}</span>
          <strong>{formatDate(item.targetCompletionDate)}</strong>
        </div>
        <div>
          <span>{ADMIN_UI_STRINGS.orders.totalPayableLabel}</span>
          <strong>{formatCurrency(getItemAmount(item))}</strong>
        </div>
        <div>
          <span>{ADMIN_UI_STRINGS.orders.paymentStatusPrefix}</span>
          <strong>{paymentLabel(order.paymentStatus)}</strong>
        </div>
        {item.courierName || item.outboundTrackingNumber ? (
          <div>
            <span>{ADMIN_UI_STRINGS.orders.outboundTrackingLabel}</span>
            <strong>{[item.courierName, item.outboundTrackingNumber].filter(Boolean).join(" / ") || "-"}</strong>
          </div>
        ) : null}
      </div>
      {order.addressSnapshot ? (
        <div className="processing-task-row__address">
          <span>{ADMIN_UI_STRINGS.orders.shippingAddress}</span>
          {joinAddress(order.addressSnapshot).map((line) => <div key={`${item.id}:${line}`}>{line}</div>)}
        </div>
      ) : null}
      {getTimeline(item).length ? (
        <div className="orders-item-timeline">
          {getTimeline(item).map(([label, value]) => (
            <span key={`${item.id}:inline:${label}`}>{label}: {formatDate(value)}</span>
          ))}
        </div>
      ) : null}
    </div>
  );

  const handlePackagingVerify = async () => {
    if (!packagingModalEntry) return;
    await performAction(
      packagingModalEntry.order.id,
      packagingModalEntry.item.id,
      `/api/admin/orders/${encodeURIComponent(packagingModalEntry.order.id)}/items/${encodeURIComponent(packagingModalEntry.item.id)}/verify-package`,
      undefined,
      { successMessage: ADMIN_UI_STRINGS.orders.packageVerifiedSuccess }
    );
  };

  const handlePackagingPrintLabel = async () => {
    if (!packagingModalEntry) return;
    await performAction(
      packagingModalEntry.order.id,
      packagingModalEntry.item.id,
      `/api/admin/orders/${encodeURIComponent(packagingModalEntry.order.id)}/items/${encodeURIComponent(packagingModalEntry.item.id)}/print-label`,
      undefined,
      {
        successMessage: ADMIN_UI_STRINGS.orders.labelPrintedSuccess,
        afterSuccess: () => openLabelPreview(packagingModalEntry.order.id, packagingModalEntry.item.id),
      }
    );
  };

  const handlePackagingReprintLabel = async () => {
    if (!packagingModalEntry) return;
    await performAction(
      packagingModalEntry.order.id,
      packagingModalEntry.item.id,
      `/api/admin/orders/${encodeURIComponent(packagingModalEntry.order.id)}/items/${encodeURIComponent(packagingModalEntry.item.id)}/reprint-label`,
      { reason: "LABEL_DAMAGED" },
      {
        successMessage: ADMIN_UI_STRINGS.orders.labelReprintedSuccess,
        afterSuccess: () => openLabelPreview(packagingModalEntry.order.id, packagingModalEntry.item.id),
      }
    );
  };

  const handlePackagingMarkPacked = async () => {
    if (!packagingModalEntry) return;
    const packed = await performAction(
      packagingModalEntry.order.id,
      packagingModalEntry.item.id,
      `/api/admin/orders/${encodeURIComponent(packagingModalEntry.order.id)}/items/${encodeURIComponent(packagingModalEntry.item.id)}/mark-packed`,
      undefined,
      { successMessage: ADMIN_UI_STRINGS.orders.packagePackedSuccess }
    );
    if (packed) setPackagingModalState(null);
  };

  const handleShippingSubmit = async () => {
    if (!shippingModalState || !shippingModalEntry) return;
    const courierName = shippingModalState.courierName.trim();
    const trackingNumber = shippingModalState.trackingNumber.trim();

    if (!courierName || !trackingNumber) {
      setShippingModalState((current) => current ? {
        ...current,
        formError: ADMIN_UI_STRINGS.orders.shippingModalValidation,
      } : current);
      return;
    }

    const shipped = await performAction(
      shippingModalEntry.order.id,
      shippingModalEntry.item.id,
      `/api/admin/orders/${encodeURIComponent(shippingModalEntry.order.id)}/items/${encodeURIComponent(shippingModalEntry.item.id)}/ship`,
      { courierName, trackingNumber },
      { successMessage: ADMIN_UI_STRINGS.orders.shippingCompletedSuccess }
    );

    if (shipped) setShippingModalState(null);
  };

  const renderTaskRowActions = (order: OrderDoc, item: OrderItemDoc, options?: { includeOpenOrder?: boolean }) => {
    const includeOpenOrder = options?.includeOpenOrder ?? true;
    const status = String(item.fulfillmentStatus || "").toUpperCase();
    const owner = String(item.physicalOwner || "").toUpperCase();
    const pendingType = String(item.pendingHandover?.type || "").toUpperCase();
    const pendingStatus = String(item.pendingHandover?.status || "").toUpperCase();
    const isCancelledShippingPendingReceipt =
      status === "CANCEL_REQUESTED" &&
      pendingType === "PACKAGING_TO_SHIPPING" &&
      pendingStatus === "PENDING_RECEIPT";

    return (
      <>
        {includeOpenOrder ? (
          <button
            type="button"
            className="secondary"
            aria-expanded={expandedTaskDetailKey === buildOrderItemKey(order.id, item.id)}
            onClick={() => toggleTaskDetails(order.id, item.id)}
          >
            {expandedTaskDetailKey === buildOrderItemKey(order.id, item.id)
              ? ADMIN_UI_STRINGS.orders.collapseDetails
              : ADMIN_UI_STRINGS.orders.processingTaskOpenOrder}
          </button>
        ) : null}
        {lane === "processing" && status === "RESERVED" ? (
          <button onClick={() => performAction(order.id, item.id, `/api/admin/orders/${encodeURIComponent(order.id)}/items/${encodeURIComponent(item.id)}/pick`, undefined, { successMessage: ADMIN_UI_STRINGS.orders.pickSuccess })}>
            {ADMIN_UI_STRINGS.orders.pickItem}
          </button>
        ) : null}
        {lane === "processing" && status === "PICKED_FROM_WAREHOUSE" ? (
          <button onClick={() => performAction(order.id, item.id, `/api/admin/orders/${encodeURIComponent(order.id)}/items/${encodeURIComponent(item.id)}/handover-to-packaging`, undefined, { successMessage: ADMIN_UI_STRINGS.orders.processingHandoverSuccess })}>
            {ADMIN_UI_STRINGS.orders.handoverToPackaging}
          </button>
        ) : null}
        {lane === "processing" && status === "CANCEL_REQUESTED" && owner === "PROCESSING_MANAGER" ? (
          <button onClick={() => performAction(order.id, item.id, `/api/admin/orders/${encodeURIComponent(order.id)}/items/${encodeURIComponent(item.id)}/handover-to-cancellation`, undefined, { successMessage: ADMIN_UI_STRINGS.orders.cancellationHandoverSuccess })}>
            {ADMIN_UI_STRINGS.orders.handoverToCancellation}
          </button>
        ) : null}

        {lane === "packaging" && status === "HANDED_TO_PACKAGING" ? (
          <>
            <button onClick={() => performAction(order.id, item.id, `/api/admin/orders/${encodeURIComponent(order.id)}/items/${encodeURIComponent(item.id)}/confirm-packaging-receipt`, undefined, { successMessage: ADMIN_UI_STRINGS.orders.packagingReceiptConfirmedSuccess })}>
              {ADMIN_UI_STRINGS.orders.confirmPackagingReceipt}
            </button>
            <button
              className="secondary"
              onClick={() => {
                const reason = window.prompt(ADMIN_UI_STRINGS.orders.rejectPackagingPrompt, "ITEM_NOT_RECEIVED") || "";
                if (!reason.trim()) return;
                void performAction(
                  order.id,
                  item.id,
                  `/api/admin/orders/${encodeURIComponent(order.id)}/items/${encodeURIComponent(item.id)}/reject-packaging-receipt`,
                  { reason },
                  { successMessage: ADMIN_UI_STRINGS.orders.packagingReceiptRejectedSuccess }
                );
              }}
            >
              {ADMIN_UI_STRINGS.orders.rejectPackagingReceipt}
            </button>
          </>
        ) : null}
        {lane === "packaging" && ["PACKAGING_RECEIVED", "PACKAGING_IN_PROGRESS"].includes(status) ? (
          <button onClick={() => { void openPackagingModal(order.id, item.id); }}>
            {ADMIN_UI_STRINGS.orders.packageItem}
          </button>
        ) : null}
        {lane === "packaging" && status === "PACKED" ? (
          <button onClick={() => performAction(order.id, item.id, `/api/admin/orders/${encodeURIComponent(order.id)}/items/${encodeURIComponent(item.id)}/handover-to-shipping`, undefined, { successMessage: ADMIN_UI_STRINGS.orders.packagingHandoverSuccess })}>
            {ADMIN_UI_STRINGS.orders.handoverToShipping}
          </button>
        ) : null}
        {lane === "packaging" && status === "CANCEL_REQUESTED" && owner === "PACKAGING_MANAGER" ? (
          <button onClick={() => performAction(order.id, item.id, `/api/admin/orders/${encodeURIComponent(order.id)}/items/${encodeURIComponent(item.id)}/handover-to-cancellation`, undefined, { successMessage: ADMIN_UI_STRINGS.orders.cancellationHandoverSuccess })}>
            {ADMIN_UI_STRINGS.orders.handoverToCancellation}
          </button>
        ) : null}

        {lane === "shipping" && (status === "HANDED_TO_SHIPPING" || isCancelledShippingPendingReceipt) ? (
          <>
            <button onClick={() => performAction(order.id, item.id, `/api/admin/orders/${encodeURIComponent(order.id)}/items/${encodeURIComponent(item.id)}/confirm-shipping-receipt`, undefined, { successMessage: ADMIN_UI_STRINGS.orders.shippingReceiptConfirmedSuccess })}>
              {ADMIN_UI_STRINGS.orders.confirmShippingReceipt}
            </button>
            <button
              className="secondary"
              onClick={() => {
                const reason = window.prompt(ADMIN_UI_STRINGS.orders.rejectShippingPrompt, "ITEM_NOT_RECEIVED") || "";
                if (!reason.trim()) return;
                void performAction(
                  order.id,
                  item.id,
                  `/api/admin/orders/${encodeURIComponent(order.id)}/items/${encodeURIComponent(item.id)}/reject-shipping-receipt`,
                  { reason },
                  { successMessage: ADMIN_UI_STRINGS.orders.shippingReceiptRejectedSuccess }
                );
              }}
            >
              {ADMIN_UI_STRINGS.orders.rejectShippingReceipt}
            </button>
          </>
        ) : null}
        {lane === "shipping" && ["SHIPPING_RECEIVED", "SHIPPING_IN_PROGRESS"].includes(status) ? (
          <button onClick={() => openShippingModal(order.id, item.id)}>
            {ADMIN_UI_STRINGS.orders.shipItem}
          </button>
        ) : null}
        {lane === "shipping" && status === "CANCEL_REQUESTED" && owner === "SHIPPING_OPERATOR" ? (
          <button onClick={() => performAction(order.id, item.id, `/api/admin/orders/${encodeURIComponent(order.id)}/items/${encodeURIComponent(item.id)}/handover-to-cancellation`, undefined, { successMessage: ADMIN_UI_STRINGS.orders.cancellationHandoverSuccess })}>
            {ADMIN_UI_STRINGS.orders.handoverToCancellation}
          </button>
        ) : null}
      </>
    );
  };

  const getPrintReference = (item: OrderItemDoc) => {
    if (lane === "shipping") {
      return [item.courierName, item.outboundTrackingNumber].filter(Boolean).join(" • ") || "-";
    }
    return item.cancellationReason || item.pendingHandover?.type || "-";
  };

  const required = requiredAnyOf || DEFAULT_REQUIRED[lane];
  const hasLaneAccess = hasOrderLaneAccess(orderAccess, lane);

  return (
    <ProtectedPage anyOf={required}>
      {!hasLaneAccess ? (
        <div className="card">Forbidden</div>
      ) : (
        <>
      <DashboardNav />

      <section className="card row" style={{ justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div className="orders-detail__eyebrow">{subtitle}</div>
          <h1 style={{ margin: "6px 0 0" }}>{title}</h1>
        </div>
        <div className="row">
          <Link href={backHref}><button className="secondary">{backLabel}</button></Link>
          <button className="secondary" onClick={() => load(selectedOrderId)}>{ADMIN_UI_STRINGS.common.refresh}</button>
        </div>
      </section>

      {taskBoard ? (
        <section className="processing-task-board">
          <article className="card processing-task-board__intro">
            <div>
              <div className="orders-detail__eyebrow">{taskBoard.managerLabel}</div>
              <h2>{taskBoard.title}</h2>
              <p className="dashboard-panel__help">{taskBoard.subtitle}</p>
            </div>
            <div className="processing-task-board__summary">
              {taskBoard.summary.map((card) => (
                <div key={card.label} className="processing-task-pill">
                  <span>{card.label}</span>
                  <strong>{card.count}</strong>
                </div>
              ))}
            </div>
          </article>

          {taskBoard.buckets.map((bucket) => {
            const selectedBucketEntries = getBucketSelectedEntries(bucket);
            const effectiveBucketEntries = getEffectiveBucketPrintEntries(bucket);
            const bucketPage = Math.max(1, bucketPages[bucket.key] || 1);
            const bucketTotalPages = Math.max(1, Math.ceil(bucket.entries.length / TASK_BUCKET_PAGE_SIZE));
            const visibleEntries = bucket.entries.slice(
              (bucketPage - 1) * TASK_BUCKET_PAGE_SIZE,
              bucketPage * TASK_BUCKET_PAGE_SIZE
            );
            return (
            <article key={bucket.key} className="card processing-task-section">
              <div className="processing-task-section__header">
                <div>
                  <div className="orders-detail__eyebrow">{bucket.label}</div>
                  <strong>{ADMIN_UI_STRINGS.orders.processingTaskOrderCount(bucket.entries.length)}</strong>
                </div>
                <div className="processing-task-section__controls">
                  <div className="processing-task-section__hint">
                    {!bucket.entries.length
                      ? ADMIN_UI_STRINGS.orders.processingPrintEmpty
                      : selectedBucketEntries.length
                        ? ADMIN_UI_STRINGS.orders.processingPrintSelectedCount(selectedBucketEntries.length)
                        : ADMIN_UI_STRINGS.orders.processingPrintDefaultHint(bucket.entries.length)}
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!bucket.entries.length}
                    onClick={() => toggleSelectAllBucket(bucket)}
                  >
                    {ADMIN_UI_STRINGS.orders.processingSelectAllPending}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!effectiveBucketEntries.length}
                    onClick={() => triggerBucketPrint(bucket)}
                  >
                    {bucket.printLabel}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => toggleSection(bucket.key)}
                    aria-expanded={!collapsedSections[bucket.key]}
                  >
                    {collapsedSections[bucket.key] ? ADMIN_UI_STRINGS.orders.expandDetails : ADMIN_UI_STRINGS.orders.collapseDetails}
                  </button>
                </div>
              </div>

              {!collapsedSections[bucket.key] ? (
                !bucket.entries.length ? (
                  <div className="dashboard-empty">{ADMIN_UI_STRINGS.orders.processingTaskSectionEmpty}</div>
                ) : (
                  <>
                    <div className="processing-task-list">
                      {visibleEntries.map(({ key, order, item, status, needsAttention, hint }) => {
                        const isSelected = selectedPrintKeys.includes(key);
                        return (
                          <div key={key} className={`processing-task-row ${needsAttention ? "is-attention" : ""}`}>
                            <label className="processing-task-row__select">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => togglePrintSelection(order.id, item.id)}
                                aria-label={`${ADMIN_UI_STRINGS.orders.processingSelectionInputLabel} ${orderDisplayId(order)}`}
                              />
                            </label>
                            <div className="processing-task-row__copy">
                              <strong>{orderDisplayId(order)} • {item.title}</strong>
                              <span>{item.stockKey || "-"} • Qty {item.quantity} • {statusLabel(item.fulfillmentStatus)}</span>
                              <span>{ADMIN_UI_STRINGS.orders.customerOrderedDateLabel}: {formatDate(item.customerOrderedDate || order.placedAt)}</span>
                              {hint ? <span>{hint}</span> : null}
                              {needsAttention ? <span>{ADMIN_UI_STRINGS.orders.delayedIndicator}</span> : null}
                            </div>
                            <div className="processing-task-row__actions">
                              {renderTaskRowActions(order, item)}
                            </div>
                            {expandedTaskDetailKey === key ? renderInlineOrderDetails(order, item) : null}
                          </div>
                        );
                      })}
                    </div>
                    {bucketTotalPages > 1 ? (
                      <PaginationControls
                        page={bucketPage}
                        totalPages={bucketTotalPages}
                        total={bucket.entries.length}
                        onPrevious={() => setBucketPage(bucket.key, (current) => Math.max(1, current - 1))}
                        onNext={() => setBucketPage(bucket.key, (current) => Math.min(bucketTotalPages, current + 1))}
                        previousLabel={ADMIN_UI_STRINGS.common.previous}
                        nextLabel={ADMIN_UI_STRINGS.common.next}
                      />
                    ) : null}
                  </>
                )
              ) : null}
            </article>
          )})}
        </section>
      ) : null}

      <section className="card row" style={{ gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <label style={{ minWidth: 220, flex: "1 1 220px" }}>
          {ADMIN_UI_STRINGS.orders.searchLabel}
          <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
        </label>
        <label style={{ minWidth: 220, flex: "1 1 220px" }}>
          {ADMIN_UI_STRINGS.orders.stockKeyLabel}
          <input value={stockKeyInput} onChange={(event) => setStockKeyInput(event.target.value)} />
        </label>
        <div className="section-copy">
          {ADMIN_UI_STRINGS.orders.summaryQueueCount}: {total}
        </div>
      </section>

      {error ? <div className="error">{error}</div> : null}
      {actionError ? <div className="error">{actionError}</div> : null}
      {actionSuccess ? <div className="success-banner">{actionSuccess}</div> : null}
      {loading ? <div>{ADMIN_UI_STRINGS.common.loadingOrders}</div> : null}

      {!loading && !orders.length ? (
        <section className="card">
          <p className="section-copy">{ADMIN_UI_STRINGS.orders.emptyQueue}</p>
        </section>
      ) : null}

      {orders.length ? (
        <div className="orders-layout">
          <aside className="orders-list">
            {orders.map((order) => (
              <button
                key={order.id}
                type="button"
                className={`orders-list__item ${selectedOrder?.id === order.id ? "is-active" : ""}`}
                onClick={() => setSelectedOrderId(order.id)}
              >
                <div>
                  <strong>{orderDisplayId(order)}</strong>
                  <div className="section-copy">{formatDate(order.placedAt)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div>{summarizeLaneItems(order.items)}</div>
                  <div className="section-copy">{ADMIN_UI_STRINGS.orders.processingTaskOrderCount(order.items.length)}</div>
                </div>
                <div className="section-copy">
                  {ADMIN_UI_STRINGS.orders.orderSummaryStatusLabel}: {statusLabel(order.fulfillmentStatus)}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="section-copy">{formatCurrency(getOrderAmount(order))}</div>
                </div>
              </button>
            ))}
          </aside>

          <section className="card orders-detail">
            {selectedOrder ? (
              <div style={{ display: "grid", gap: 20 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "start", flexWrap: "wrap" }}>
                  <div>
                    <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.detailTitle}</div>
                    <h2 style={{ margin: "6px 0 0" }}>{orderDisplayId(selectedOrder)}</h2>
                    <div className="section-copy">
                      {ADMIN_UI_STRINGS.orders.orderSummaryStatusLabel}: {statusLabel(selectedOrder.fulfillmentStatus)}
                    </div>
                    <div className="section-copy">
                      {ADMIN_UI_STRINGS.orders.laneSummaryLabel}: {summarizeLaneItems(selectedOrder.items)}
                    </div>
                    <div className="section-copy">
                      {ADMIN_UI_STRINGS.orders.paymentStatusPrefix}: {paymentLabel(selectedOrder.paymentStatus)}
                    </div>
                    <div className="section-copy">
                      {ADMIN_UI_STRINGS.orders.itemsInQueue}: {selectedOrder.items.length}
                    </div>
                  </div>
                  <strong>{formatCurrency(getOrderAmount(selectedOrder))}</strong>
                </div>

                {selectedOrder.addressSnapshot ? (
                  <div className="card" style={{ display: "grid", gap: 8 }}>
                    <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.shippingAddress}</div>
                    {joinAddress(selectedOrder.addressSnapshot).map((line) => <div key={line}>{line}</div>)}
                  </div>
                ) : null}

                <div className="card" style={{ display: "grid", gap: 8 }}>
                  <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.orders.totalPayableLabel}</div>
                  <div className="checkout-summary__row">
                    <span>{ADMIN_UI_STRINGS.orders.merchandiseTotalLabel}</span>
                    <strong>{formatCurrency(Number(selectedOrder.subtotal || 0))}</strong>
                  </div>
                  {Number(selectedOrder.discountTotal || 0) > 0 ? (
                    <div className="checkout-summary__row">
                      <span>{ADMIN_UI_STRINGS.orders.discountLabel}</span>
                      <strong>-{formatCurrency(Number(selectedOrder.discountTotal || 0))}</strong>
                    </div>
                  ) : null}
                  <div className="checkout-summary__row">
                    <span>{ADMIN_UI_STRINGS.orders.gstIncludedLabel}</span>
                    <strong>{formatCurrency(Number(selectedOrder.pricingSnapshot?.includedTaxTotal ?? selectedOrder.taxTotal ?? 0))}</strong>
                  </div>
                  <div className="checkout-summary__row">
                    <span>{ADMIN_UI_STRINGS.orders.shippingLabel}</span>
                    <strong>{formatCurrency(Number(selectedOrder.shippingTotal || 0))}</strong>
                  </div>
                  <div className="checkout-summary__row">
                    <span>{ADMIN_UI_STRINGS.orders.totalPayableLabel}</span>
                    <strong>{formatCurrency(getOrderAmount(selectedOrder))}</strong>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 16 }}>
                  {selectedOrder.items.map((item) => {
                    const status = String(item.fulfillmentStatus || "").toUpperCase();
                    const hasCancellationAccess = orderAccess.cancellations;
                    const hasAdminAccess = orderAccess.admin;

                    const canAdminCancel = hasAdminAccess &&
                      !["SHIPPED", "DELIVERED", "CANCELLED_BEFORE_PICKING", "CANCEL_RESTOCKED", "CANCEL_DAMAGED", "CANCEL_LOST", "CANCEL_CLOSED"].includes(status);
                    const canCancellationConfirm = lane === "cancellations" && status === "HANDED_TO_CANCELLATION" && hasCancellationAccess;
                    const canCancellationRestock = lane === "cancellations" && status === "CANCELLATION_RECEIVED" && hasCancellationAccess;
                    const canCancellationDamaged = lane === "cancellations" && status === "CANCELLATION_RECEIVED" && hasCancellationAccess;
                    const canCancellationLost = lane === "cancellations" && ["HANDED_TO_CANCELLATION", "CANCELLATION_RECEIVED"].includes(status) && hasCancellationAccess;

                    return (
                      <article key={item.id} className="card" style={{ display: "grid", gap: 14 }}>
                        <div className="row" style={{ justifyContent: "space-between", alignItems: "start", flexWrap: "wrap" }}>
                          <div>
                            <strong>{item.title}</strong>
                            <div className="section-copy">{item.stockKey || "-"}</div>
                            <div className="section-copy">
                              {ADMIN_UI_STRINGS.orders.itemStateLabel}: {statusLabel(item.fulfillmentStatus)}
                            </div>
                            <div className="section-copy">
                              {ADMIN_UI_STRINGS.orders.physicalOwnerLabel}: {item.physicalOwner || "-"}
                            </div>
                            <div className="section-copy">
                              {ADMIN_UI_STRINGS.orders.currentStageLabel}: {item.currentStage || "-"}
                            </div>
                            {getLaneDescription(lane, item) ? (
                              <div className="section-copy">{getLaneDescription(lane, item)}</div>
                            ) : null}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div>{ADMIN_UI_STRINGS.orders.itemQuantityLabel}: {item.quantity}</div>
                            <strong>{formatCurrency(getItemAmount(item))}</strong>
                          </div>
                        </div>

                        <div className="orders-item-meta">
                          <span style={isAttentionSla(item.slaStatus) ? { color: "#a22f2f", fontWeight: 700 } : undefined}>
                            {ADMIN_UI_STRINGS.orders.slaStatusLabel}: {statusLabel(item.slaStatus)}
                          </span>
                          <span style={isAttentionSla(item.slaStatus) ? { color: "#a22f2f", fontWeight: 700 } : undefined}>
                            {ADMIN_UI_STRINGS.orders.customerOrderedDateLabel}: {formatDate(item.customerOrderedDate)}
                          </span>
                          <span style={isAttentionSla(item.slaStatus) ? { color: "#a22f2f", fontWeight: 700 } : undefined}>
                            {ADMIN_UI_STRINGS.orders.targetCompletionDateLabel}: {formatDate(item.targetCompletionDate)}
                          </span>
                          {item.lastActionedAt ? (
                            <span style={isAttentionSla(item.slaStatus) ? { color: "#a22f2f", fontWeight: 700 } : undefined}>
                              {ADMIN_UI_STRINGS.orders.lastActionedAtLabel}: {formatDate(item.lastActionedAt)}
                            </span>
                          ) : null}
                          {item.laneAssignedAt ? (
                            <span>{ADMIN_UI_STRINGS.orders.laneAssignedAtLabel}: {formatDate(item.laneAssignedAt)}</span>
                          ) : null}
                          {typeof item.hoursInLane === "number" ? (
                            <span>{ADMIN_UI_STRINGS.orders.hoursInLaneLabel}: {item.hoursInLane.toFixed(1)}</span>
                          ) : null}
                          {item.packageVerificationStatus ? (
                            <span>{ADMIN_UI_STRINGS.orders.packageVerificationLabel}: {item.packageVerificationStatus}</span>
                          ) : null}
                          {item.labelStatus ? (
                            <span>{ADMIN_UI_STRINGS.orders.labelStatusLabel}: {item.labelStatus}</span>
                          ) : null}
                          {item.labelReprintCount ? (
                            <span>{ADMIN_UI_STRINGS.orders.labelReprintsLabel}: {item.labelReprintCount}</span>
                          ) : null}
                          {item.courierName ? (
                            <span>{ADMIN_UI_STRINGS.orders.courierLabel}: {item.courierName}</span>
                          ) : null}
                          {item.outboundTrackingNumber ? (
                            <span>{ADMIN_UI_STRINGS.orders.outboundTrackingLabel}: {item.outboundTrackingNumber}</span>
                          ) : null}
                          {item.pendingHandover?.type ? (
                            <span>{ADMIN_UI_STRINGS.orders.pendingHandoverLabel}: {item.pendingHandover.type}</span>
                          ) : null}
                          {item.cancellationReason ? (
                            <span>{ADMIN_UI_STRINGS.orders.cancellationReasonLabel}: {item.cancellationReason}</span>
                          ) : null}
                        </div>

                        {getTimeline(item).length ? (
                          <div className="orders-item-timeline">
                            {getTimeline(item).map(([label, value]) => (
                              <span key={`${item.id}:${label}`}>{label}: {formatDate(value)}</span>
                            ))}
                          </div>
                        ) : null}

                        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                          {canAdminCancel ? (
                            <button
                              className="danger"
                              disabled={actionBusyKey === `${item.id}:/api/admin/orders/order-items/${item.id}/cancel`}
                              onClick={() => performAction(
                                selectedOrder.id,
                                item.id,
                                `/api/admin/orders/order-items/${encodeURIComponent(item.id)}/cancel`,
                                { reason: "ADMIN_CANCELLED" },
                                { confirmMessage: ADMIN_UI_STRINGS.orders.cancelConfirm }
                              )}
                            >
                              {ADMIN_UI_STRINGS.orders.cancelItem}
                            </button>
                          ) : null}
                          {renderTaskRowActions(selectedOrder, item, { includeOpenOrder: false })}
                          {canCancellationConfirm ? (
                            <button onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/confirm-cancellation-receipt`)}>
                              {ADMIN_UI_STRINGS.orders.confirmCancellationReceipt}
                            </button>
                          ) : null}
                          {canCancellationRestock ? (
                            <button onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/restock-cancelled`)}>
                              {ADMIN_UI_STRINGS.orders.restockCancelledItem}
                            </button>
                          ) : null}
                          {canCancellationDamaged ? (
                            <button
                              className="secondary"
                              onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/mark-cancelled-damaged`)}
                            >
                              {ADMIN_UI_STRINGS.orders.markCancelledDamaged}
                            </button>
                          ) : null}
                          {canCancellationLost ? (
                            <button
                              className="secondary"
                              onClick={() => performAction(selectedOrder.id, item.id, `/api/admin/orders/${encodeURIComponent(selectedOrder.id)}/items/${encodeURIComponent(item.id)}/mark-cancelled-lost`)}
                            >
                              {ADMIN_UI_STRINGS.orders.markCancelledLost}
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {totalPages > 1 ? (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          total={total}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
          previousLabel={ADMIN_UI_STRINGS.common.previous}
          nextLabel={ADMIN_UI_STRINGS.common.next}
        />
      ) : null}

      {packagingModalState && packagingModalEntry ? (
        <div className="inventory-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="packaging-work-title">
          <div className="inventory-modal processing-action-modal">
            <div className="inventory-modal__header">
              <div>
                <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.menu.packagingManager}</div>
                <h2 id="packaging-work-title">{ADMIN_UI_STRINGS.orders.packagingModalTitle}</h2>
                <p className="dashboard-panel__help">
                  {orderDisplayId(packagingModalEntry.order)} • {packagingModalEntry.item.title}
                </p>
              </div>
              <button type="button" className="secondary" onClick={() => setPackagingModalState(null)}>
                {ADMIN_UI_STRINGS.common.cancel}
              </button>
            </div>
            <div className="inventory-modal__meta">
              <span>{packagingModalEntry.item.stockKey || "-"}</span>
              <span>Qty {packagingModalEntry.item.quantity}</span>
              <span>{statusLabel(packagingModalEntry.item.fulfillmentStatus)}</span>
            </div>
            <div className="processing-action-modal__steps">
              <section className="processing-action-modal__step">
                <strong>{ADMIN_UI_STRINGS.orders.packagingModalVerifyTitle}</strong>
                <p>{ADMIN_UI_STRINGS.orders.packagingModalVerifyHelp}</p>
                <div className="processing-action-modal__step-meta">
                  <span>{ADMIN_UI_STRINGS.orders.packageVerificationLabel}: {statusLabel(packagingModalEntry.item.packageVerificationStatus)}</span>
                  {String(packagingModalEntry.item.packageVerificationStatus || "").toUpperCase() !== "VERIFIED" ? (
                    <button type="button" onClick={() => { void handlePackagingVerify(); }}>
                      {ADMIN_UI_STRINGS.orders.verifyPackage}
                    </button>
                  ) : null}
                </div>
              </section>
              <section className="processing-action-modal__step">
                <strong>{ADMIN_UI_STRINGS.orders.packagingModalLabelTitle}</strong>
                <p>{ADMIN_UI_STRINGS.orders.packagingModalLabelHelp}</p>
                <div className="processing-action-modal__step-meta">
                  <span>{ADMIN_UI_STRINGS.orders.labelStatusLabel}: {statusLabel(packagingModalEntry.item.labelStatus)}</span>
                  {String(packagingModalEntry.item.packageVerificationStatus || "").toUpperCase() === "VERIFIED" &&
                  String(packagingModalEntry.item.labelStatus || "").toUpperCase() !== "PRINTED" ? (
                    <button type="button" onClick={() => { void handlePackagingPrintLabel(); }}>
                      {ADMIN_UI_STRINGS.orders.printLabel}
                    </button>
                  ) : null}
                  {String(packagingModalEntry.item.labelStatus || "").toUpperCase() === "PRINTED" ? (
                    <>
                      <button type="button" className="secondary" onClick={() => { void handlePackagingReprintLabel(); }}>
                        {ADMIN_UI_STRINGS.orders.reprintLabel}
                      </button>
                      <button type="button" className="secondary" onClick={() => openLabelPreview(packagingModalEntry.order.id, packagingModalEntry.item.id)}>
                        {ADMIN_UI_STRINGS.orders.viewLabel}
                      </button>
                    </>
                  ) : null}
                </div>
              </section>
              <section className="processing-action-modal__step">
                <strong>{ADMIN_UI_STRINGS.orders.packagingModalPackedTitle}</strong>
                <p>{ADMIN_UI_STRINGS.orders.packagingModalPackedHelp}</p>
                <div className="processing-action-modal__step-meta">
                  <span>
                    {String(packagingModalEntry.item.packageVerificationStatus || "").toUpperCase() === "VERIFIED" &&
                    String(packagingModalEntry.item.labelStatus || "").toUpperCase() === "PRINTED"
                      ? ADMIN_UI_STRINGS.orders.packagingModalReadyToPack
                      : ADMIN_UI_STRINGS.orders.packagingModalBlocked}
                  </span>
                </div>
              </section>
            </div>
            <div className="inventory-modal__actions">
              <button type="button" className="secondary" onClick={() => setPackagingModalState(null)}>
                {ADMIN_UI_STRINGS.common.cancel}
              </button>
              <button
                type="button"
                disabled={
                  String(packagingModalEntry.item.packageVerificationStatus || "").toUpperCase() !== "VERIFIED" ||
                  String(packagingModalEntry.item.labelStatus || "").toUpperCase() !== "PRINTED"
                }
                onClick={() => { void handlePackagingMarkPacked(); }}
              >
                {ADMIN_UI_STRINGS.orders.markPacked}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shippingModalState && shippingModalEntry ? (
        <div className="inventory-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="shipping-work-title">
          <div className="inventory-modal processing-action-modal">
            <div className="inventory-modal__header">
              <div>
                <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.menu.shippingOperator}</div>
                <h2 id="shipping-work-title">{ADMIN_UI_STRINGS.orders.shippingModalTitle}</h2>
                <p className="dashboard-panel__help">
                  {orderDisplayId(shippingModalEntry.order)} • {shippingModalEntry.item.title}
                </p>
              </div>
              <button type="button" className="secondary" onClick={() => setShippingModalState(null)}>
                {ADMIN_UI_STRINGS.common.cancel}
              </button>
            </div>
            <div className="inventory-modal__meta">
              <span>{shippingModalEntry.item.stockKey || "-"}</span>
              <span>Qty {shippingModalEntry.item.quantity}</span>
              <span>{statusLabel(shippingModalEntry.item.fulfillmentStatus)}</span>
            </div>
            <p className="dashboard-panel__help">{ADMIN_UI_STRINGS.orders.shippingModalHelp}</p>
            <div className="inventory-modal__form">
              <label>
                <span>{ADMIN_UI_STRINGS.orders.shippingModalCourierLabel}</span>
                <input
                  value={shippingModalState.courierName}
                  onChange={(event) => setShippingModalState((current) => current ? {
                    ...current,
                    courierName: event.target.value,
                    formError: "",
                  } : current)}
                />
                <small>{ADMIN_UI_STRINGS.orders.shippingModalCourierHelp}</small>
              </label>
              <label>
                <span>{ADMIN_UI_STRINGS.orders.shippingModalTrackingLabel}</span>
                <input
                  value={shippingModalState.trackingNumber}
                  onChange={(event) => setShippingModalState((current) => current ? {
                    ...current,
                    trackingNumber: event.target.value,
                    formError: "",
                  } : current)}
                />
                <small>{ADMIN_UI_STRINGS.orders.shippingModalTrackingHelp}</small>
              </label>
              {shippingModalState.formError ? (
                <div className="error" style={{ margin: 0 }}>{shippingModalState.formError}</div>
              ) : null}
            </div>
            <div className="inventory-modal__actions">
              <button type="button" className="secondary" onClick={() => setShippingModalState(null)}>
                {ADMIN_UI_STRINGS.common.cancel}
              </button>
              <button type="button" onClick={() => { void handleShippingSubmit(); }}>
                {ADMIN_UI_STRINGS.orders.shipItem}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {taskBoard && activePrintBucket && getEffectiveBucketPrintEntries(activePrintBucket).length ? (
        <section className="processing-print-sheet">
          <header className="processing-print-sheet__header">
            <div>
              <div className="orders-detail__eyebrow">{taskBoard.managerLabel}</div>
              <h2>{activePrintBucket.printTitle}</h2>
            </div>
            <div>
              <strong>{ADMIN_UI_STRINGS.orders.processingPrintGeneratedAt}</strong>
              <div>{new Date().toLocaleString()}</div>
            </div>
          </header>
          <div className="processing-print-sheet__table">
            <div className="processing-print-sheet__row processing-print-sheet__row--head">
              <span>{ADMIN_UI_STRINGS.orders.processingPrintOrder}</span>
              <span>{ADMIN_UI_STRINGS.orders.productNameLabel}</span>
              <span>{ADMIN_UI_STRINGS.orders.processingPrintStorageReference}</span>
              <span>{ADMIN_UI_STRINGS.orders.itemQuantityLabel}</span>
              <span>{ADMIN_UI_STRINGS.orders.customerOrderedDateLabel}</span>
              <span>{ADMIN_UI_STRINGS.orders.itemStateLabel}</span>
              <span>{ADMIN_UI_STRINGS.orders.processingPrintNotes}</span>
            </div>
            {getEffectiveBucketPrintEntries(activePrintBucket).map(({ order, item }) => (
              <div key={buildOrderItemKey(order.id, item.id)} className="processing-print-sheet__row">
                <span>{orderDisplayId(order)}</span>
                <span>{item.title}</span>
                <span>{item.stockKey || "-"}</span>
                <span>{item.quantity}</span>
                <span>{formatDate(item.customerOrderedDate || order.placedAt)}</span>
                <span>{statusLabel(item.fulfillmentStatus)}</span>
                <span>{getPrintReference(item)}</span>
              </div>
            ))}
          </div>
          {activePrintBucket.requiresSignature ? (
            <div className="processing-print-sheet__signoff">
              <div>
                <strong>{ADMIN_UI_STRINGS.orders.processingPrintPreparedBy}</strong>
                <div>{ADMIN_UI_STRINGS.orders.processingPrintSignatureLine}</div>
                <div>{ADMIN_UI_STRINGS.orders.processingPrintDateLine}</div>
              </div>
              <div>
                <strong>{ADMIN_UI_STRINGS.orders.processingPrintReceivedBy}</strong>
                <div>{ADMIN_UI_STRINGS.orders.processingPrintSignatureLine}</div>
                <div>{ADMIN_UI_STRINGS.orders.processingPrintDateLine}</div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
        </>
      )}
    </ProtectedPage>
  );
}
