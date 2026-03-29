/**
 * ------------------------------------------------------------------------
 * 名称：连线规划暂存区
 * 说明：存储校验通过的连线坐标数据，通过 planId 供执行阶段检索使用。
 * 作者：Lion
 * 邮箱：chengbin@3578.cn
 * 日期：2026-03-30
 * 备注：规划条目在 30 分钟后自动过期。
 * ------------------------------------------------------------------------
 */

// 单条连接的内部数据结构（含精确坐标，不向 AI 暴露）。
export interface WireConnection {
	fromRefDes: string;
	fromPin: string;
	toRefDes: string;
	toPin: string;
	netName: string;
	fromX_mil: number;
	fromY_mil: number;
	toX_mil: number;
	toY_mil: number;
	fromOrientationDeg: number;
	toOrientationDeg: number;
}

// 连线规划条目。
export interface WirePlanEntry {
	planId: string;
	connections: WireConnection[];
	createdAt: number;
}

// 规划存活时长：30 分钟。
const PLAN_TTL_MS: number = 30 * 60 * 1000;

// 规划暂存 Map。
const wirePlanStore: Map<string, WirePlanEntry> = new Map();

// 清理所有已过期规划。
function purgeExpiredPlans(): void {
	const now: number = Date.now();
	for (const [planId, plan] of wirePlanStore.entries()) {
		if (now - plan.createdAt > PLAN_TTL_MS) {
			wirePlanStore.delete(planId);
		}
	}
}

/**
 * 创建连线规划并返回唯一 planId。
 * @param connections 已校验通过的连线列表（含精确坐标）。
 * @returns 新生成的 planId。
 */
export function createWirePlan(connections: WireConnection[]): string {
	purgeExpiredPlans();
	const now: number = Date.now();
	const planId: string = `wire_plan_${String(now)}_${Math.random().toString(36).slice(2, 10)}`;
	wirePlanStore.set(planId, { planId, connections, createdAt: now });
	return planId;
}

/**
 * 按 planId 获取连线规划。
 * @param planId 规划 ID。
 * @returns 规划条目，未找到时返回 undefined。
 */
export function getWirePlan(planId: string): WirePlanEntry | undefined {
	purgeExpiredPlans();
	return wirePlanStore.get(planId);
}
