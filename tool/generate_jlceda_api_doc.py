# ------------------------------------------------------------------------
# 名称：嘉立创EDA API类型文档生成器
# 说明：将官方 index.d.ts 完整提取为可供大模型检索的 JSON API 文档
# 作者：Lion
# 邮箱：chengbin@3578.cn
# 日期：2026-02-23
# 备注：基于 TypeScript AST 进行结构化抽取并生成离线检索文档
# ------------------------------------------------------------------------

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class GeneratorConfig:
    """文档生成配置。

    Attributes:
        input_path: 官方类型定义文件路径。
        output_path: 生成的 JSON 文档路径。
        sync_output_paths: 需要同步写入的 JSON 文档路径列表。
        typescript_module_path: TypeScript 编译器模块入口文件路径。
        indent: JSON 缩进空格数。
    """

    input_path: Path
    output_path: Path
    sync_output_paths: tuple[Path, ...]
    typescript_module_path: Path
    indent: int


def parse_args() -> GeneratorConfig:
    """解析命令行参数并返回生成配置。

    Returns:
        GeneratorConfig: 结构化配置对象。

    Raises:
        SystemExit: 参数格式不合法时由 argparse 抛出。
    """

    parser = argparse.ArgumentParser(
        description="将嘉立创EDA官方 d.ts 转为 AI 检索友好的 JSON API 文档"
    )
    parser.add_argument(
        "--input",
      default=r"D:\GitCode\JLCEDA-MCP\mcp-connector\node_modules\@jlceda\pro-api-types\index.d.ts",
        help="官方类型定义文件路径",
    )
    parser.add_argument(
        "--output",
      default=r"D:\GitCode\JLCEDA-Design-Copilot\jlceda-pro-extension\iframe\jlceda-pro-api-doc.json",
        help="主输出 JSON 文件路径",
    )
    parser.add_argument(
      "--sync-output",
      action="append",
      default=[],
      help="额外同步写入的 JSON 文件路径（可重复传入）",
    )
    parser.add_argument(
        "--typescript-module",
      default=r"D:\GitCode\JLCEDA-MCP\mcp-connector\node_modules\typescript\lib\typescript.js",
        help="TypeScript 模块路径（typescript.js）",
    )
    parser.add_argument(
        "--indent",
        type=int,
        default=2,
        help="JSON 缩进空格数，默认 2",
    )

    args = parser.parse_args()
    return GeneratorConfig(
        input_path=Path(args.input),
        output_path=Path(args.output),
        sync_output_paths=tuple(Path(item) for item in args.sync_output),
        typescript_module_path=Path(args.typescript_module),
        indent=args.indent,
    )


SEARCH_SYNONYM_GROUPS: tuple[tuple[str, ...], ...] = (
  ("sch", "schematic", "原理图", "电路图"),
  ("pcb", "板子", "电路板", "线路板"),
  ("symbol", "符号", "器件符号"),
  ("footprint", "封装", "焊盘封装"),
  ("panel", "面板", "拼板"),
  ("library", "库", "元件库"),
  ("project", "工程", "项目"),
  ("document", "文档", "文件"),
  ("net", "网络", "网线"),
  ("wire", "导线", "连线"),
  ("pin", "引脚", "管脚"),
  ("component", "器件", "元件"),
  ("create", "新建", "创建"),
  ("delete", "删除", "移除"),
  ("modify", "修改", "更新"),
  ("copy", "复制", "拷贝"),
  ("move", "移动", "迁移"),
  ("search", "检索", "搜索", "查找"),
)


KIND_KEYWORD_MAP: dict[str, tuple[str, ...]] = {
  "class": ("类",),
  "interface": ("接口",),
  "typealias": ("类型别名",),
  "enum": ("枚举",),
  "enummember": ("枚举成员",),
  "function": ("函数",),
  "method": ("方法",),
  "property": ("属性",),
  "constructor": ("构造函数",),
  "callsignature": ("调用签名",),
  "indexsignature": ("索引签名",),
  "getter": ("读取器",),
  "setter": ("写入器",),
  "variable": ("变量",),
  "namespace": ("命名空间",),
}


API_ROOT_GLOBAL = "global"
API_ROOT_EDA = "eda"


# 已弃用 API 过滤配置。
# 支持三种匹配写法：
# 1) 仅函数名："getNetlist"
# 2) 所属 + 函数名："eda.sch_Netlist::getNetlist"
# 3) 完整路径："eda.sch_Netlist.getNetlist"
DEPRECATED_API_SELECTORS: tuple[str, ...] = (
  "eda.sch_Netlist::getNetlist",
)


DEPRECATED_API_CALLABLE_KINDS: set[str] = {
  "function",
  "method",
  "constructor",
  "callsignature",
  "getter",
  "setter",
}


BUILTIN_TYPE_NAMES: set[str] = {
  "array",
  "asserts",
  "bigint",
  "blob",
  "boolean",
  "date",
  "error",
  "false",
  "file",
  "formdata",
  "function",
  "map",
  "never",
  "null",
  "number",
  "object",
  "partial",
  "pick",
  "promise",
  "readonly",
  "record",
  "regexp",
  "required",
  "response",
  "set",
  "string",
  "symbol",
  "this",
  "true",
  "typeof",
  "uint8array",
  "undefined",
  "unknown",
  "void",
}


def build_deprecated_api_matchers(
  selectors: tuple[str, ...],
) -> tuple[set[str], set[tuple[str, str]], set[str]]:
  """构建弃用 API 匹配集合。"""

  name_matchers: set[str] = set()
  owner_name_matchers: set[tuple[str, str]] = set()
  full_name_matchers: set[str] = set()

  for selector in selectors:
    normalized_selector = str(selector or "").strip()
    if not normalized_selector:
      continue

    if "::" in normalized_selector:
      owner_name, api_name = normalized_selector.split("::", 1)
      owner_name = owner_name.strip()
      api_name = api_name.strip()
      if owner_name and api_name:
        owner_name_matchers.add((owner_name, api_name))
      continue

    if "." in normalized_selector:
      full_name_matchers.add(normalized_selector)
      continue

    name_matchers.add(normalized_selector)

  return name_matchers, owner_name_matchers, full_name_matchers


(
  DEPRECATED_API_NAME_MATCHERS,
  DEPRECATED_API_OWNER_NAME_MATCHERS,
  DEPRECATED_API_FULL_NAME_MATCHERS,
) = build_deprecated_api_matchers(DEPRECATED_API_SELECTORS)


def normalize_search_keyword(text: str) -> str:
  """规范化检索关键词。"""

  return str(text or "").strip().lower()


def split_search_terms(text: str) -> list[str]:
  """按分隔符拆分关键词文本。"""

  normalized_text = normalize_search_keyword(text)
  if not normalized_text:
    return []

  terms = re.split(r"[\s,，;；、|/\\:：._\-()\[\]{}]+", normalized_text)
  output: list[str] = []
  for term in terms:
    current = normalize_search_keyword(term)
    if not current:
      continue
    output.append(current)
  return output


def expand_search_terms(base_terms: set[str]) -> set[str]:
  """根据同义词组扩展关键词集合。"""

  expanded_terms = set(base_terms)
  for term in list(base_terms):
    for synonym_group in SEARCH_SYNONYM_GROUPS:
      if term in synonym_group:
        for synonym_term in synonym_group:
          expanded_terms.add(synonym_term)
  return expanded_terms


def build_symbol_search_keywords(symbol: dict[str, Any]) -> list[str]:
  """构建单个符号的关键词列表。"""

  base_terms: set[str] = set()

  for source_text in (
    str(symbol.get("name") or ""),
    str(symbol.get("fullName") or ""),
    str(symbol.get("ownerFullName") or ""),
    str(symbol.get("kind") or ""),
  ):
    if not source_text:
      continue
    base_terms.add(normalize_search_keyword(source_text))
    for split_term in split_search_terms(source_text):
      base_terms.add(split_term)

  kind = normalize_search_keyword(str(symbol.get("kind") or ""))
  if kind in KIND_KEYWORD_MAP:
    for kind_keyword in KIND_KEYWORD_MAP[kind]:
      base_terms.add(kind_keyword)

  summary_text = str((symbol.get("jsDoc") or {}).get("summary") or "")
  for summary_term in split_search_terms(summary_text):
    if len(summary_term) < 2:
      continue
    base_terms.add(summary_term)

  expanded_terms = expand_search_terms(base_terms)
  sorted_terms = sorted(
    {term for term in expanded_terms if term and len(term) >= 2}
  )
  return sorted_terms


def append_symbol_id_to_keyword_index(
  keyword_index: dict[str, list[int]],
  keyword: str,
  symbol_id: int,
) -> None:
  """向关键词索引追加符号 ID。"""

  normalized_keyword = normalize_search_keyword(keyword)
  if not normalized_keyword:
    return

  if normalized_keyword not in keyword_index:
    keyword_index[normalized_keyword] = []

  id_list = keyword_index[normalized_keyword]
  if symbol_id not in id_list:
    id_list.append(symbol_id)


def compact_ai_text(text: str) -> str:
  """压缩文本空白，保留对 AI 检索有意义的语义信息。"""

  if not isinstance(text, str):
    return ""

  compacted = re.sub(r"[\r\n\t]+", " ", text)
  compacted = re.sub(r"\s{2,}", " ", compacted)
  return compacted.strip()


def normalize_api_root_path(path_text: str) -> str:
  """将 API 路径根由 global 统一替换为 eda。"""

  normalized = str(path_text or "").strip()
  if not normalized:
    return ""

  if normalized == API_ROOT_GLOBAL:
    return API_ROOT_EDA

  global_prefix = f"{API_ROOT_GLOBAL}."
  if normalized.startswith(global_prefix):
    return f"{API_ROOT_EDA}.{normalized[len(global_prefix):]}"

  return normalized


def extract_type_name_candidates(type_text: str) -> set[str]:
  """从类型文本中提取可能指向容器类型的候选名称。"""

  compacted = compact_ai_text(type_text)
  if not compacted:
    return set()

  candidates: set[str] = set()
  for token in re.findall(r"[A-Za-z_][A-Za-z0-9_\.]*", compacted):
    item = token.split(".")[-1].strip()
    if not item:
      continue
    if item.lower() in BUILTIN_TYPE_NAMES:
      continue
    candidates.add(item)

  return candidates


def build_runtime_container_path_map(
  symbols: list[dict[str, Any]],
) -> dict[int, str]:
  """构建容器符号到运行时可调用路径的映射。"""

  container_kinds = {"class", "interface", "namespace"}
  root_container_kinds = {"class", "interface"}

  children_by_parent_id: dict[int, list[dict[str, Any]]] = {}
  container_ids_by_name: dict[str, list[int]] = {}

  for symbol in symbols:
    symbol_id = symbol.get("id")
    if not isinstance(symbol_id, int):
      continue

    parent_id = symbol.get("parentId")
    if isinstance(parent_id, int):
      children_by_parent_id.setdefault(parent_id, []).append(symbol)

    symbol_kind = str(symbol.get("kind") or "")
    symbol_name = str(symbol.get("name") or "").strip()
    if symbol_kind in container_kinds and symbol_name:
      container_ids_by_name.setdefault(symbol_name, []).append(symbol_id)

  runtime_path_by_container_id: dict[int, str] = {}
  pending_container_ids: list[int] = []

  for symbol in symbols:
    symbol_id = symbol.get("id")
    if not isinstance(symbol_id, int):
      continue

    symbol_kind = str(symbol.get("kind") or "")
    symbol_name = str(symbol.get("name") or "").strip()
    symbol_owner = str(symbol.get("ownerFullName") or "").strip()

    if symbol_kind in root_container_kinds and symbol_name == "EDA":
      runtime_path_by_container_id[symbol_id] = API_ROOT_EDA
      pending_container_ids.append(symbol_id)

    if symbol_kind == "namespace" and symbol_name == API_ROOT_GLOBAL and not symbol_owner:
      runtime_path_by_container_id.setdefault(symbol_id, API_ROOT_EDA)

  queue_index = 0
  while queue_index < len(pending_container_ids):
    container_id = pending_container_ids[queue_index]
    queue_index += 1

    container_path = runtime_path_by_container_id.get(container_id, "")
    if not container_path:
      continue

    for child_symbol in children_by_parent_id.get(container_id, []):
      child_name = str(child_symbol.get("name") or "").strip()
      child_kind = str(child_symbol.get("kind") or "")
      if not child_name:
        continue

      if child_kind not in {"property", "getter", "variable"}:
        continue

      member_path = f"{container_path}.{child_name}"
      type_candidates = extract_type_name_candidates(
        str(child_symbol.get("typeText") or "")
      )
      for type_name in type_candidates:
        for target_container_id in container_ids_by_name.get(type_name, []):
          if target_container_id in runtime_path_by_container_id:
            continue
          runtime_path_by_container_id[target_container_id] = member_path
          pending_container_ids.append(target_container_id)

  return runtime_path_by_container_id


def normalize_symbol_for_ai_output(
  symbol: dict[str, Any],
  runtime_path_by_container_id: dict[int, str],
) -> dict[str, Any]:
  """将符号标准化为 AI 友好的可调用路径与紧凑文本。"""

  normalized_symbol = dict(symbol)

  symbol_id = normalized_symbol.get("id")
  parent_id = normalized_symbol.get("parentId")
  symbol_name = str(normalized_symbol.get("name") or "")
  symbol_kind = str(normalized_symbol.get("kind") or "")
  symbol_owner = str(normalized_symbol.get("ownerFullName") or "")

  if symbol_kind == "namespace" and symbol_name == API_ROOT_GLOBAL and not symbol_owner:
    symbol_name = API_ROOT_EDA
  normalized_symbol["name"] = symbol_name

  runtime_full_name = ""
  runtime_owner_name = ""

  if isinstance(symbol_id, int) and symbol_id in runtime_path_by_container_id:
    runtime_full_name = runtime_path_by_container_id[symbol_id]
    if "." in runtime_full_name:
      runtime_owner_name = runtime_full_name.rsplit(".", 1)[0]
  elif isinstance(parent_id, int) and parent_id in runtime_path_by_container_id and symbol_name:
    runtime_owner_name = runtime_path_by_container_id[parent_id]
    runtime_full_name = f"{runtime_owner_name}.{symbol_name}"
  else:
    runtime_full_name = normalize_api_root_path(str(symbol.get("fullName") or ""))
    runtime_owner_name = normalize_api_root_path(str(symbol.get("ownerFullName") or ""))

  normalized_symbol["fullName"] = runtime_full_name
  normalized_symbol["ownerFullName"] = runtime_owner_name
  normalized_symbol["typeText"] = compact_ai_text(str(symbol.get("typeText") or ""))
  normalized_symbol["signatureText"] = compact_ai_text(str(symbol.get("signatureText") or ""))
  normalized_symbol["returnType"] = compact_ai_text(str(symbol.get("returnType") or ""))
  normalized_symbol["initializerText"] = compact_ai_text(
    str(symbol.get("initializerText") or "")
  )

  normalized_parameters: list[dict[str, Any]] = []
  for parameter in symbol.get("parameters") or []:
    if not isinstance(parameter, dict):
      continue
    normalized_parameter = dict(parameter)
    normalized_parameter["type"] = compact_ai_text(
      str(parameter.get("type") or "")
    )
    normalized_parameters.append(normalized_parameter)
  normalized_symbol["parameters"] = normalized_parameters

  return normalized_symbol


def normalize_symbols_for_ai_output(symbols: list[dict[str, Any]]) -> list[dict[str, Any]]:
  """统一标准化符号，确保检索结果优先映射到可调用路径。"""

  runtime_path_by_container_id = build_runtime_container_path_map(symbols)
  normalized_symbols: list[dict[str, Any]] = []
  for symbol in symbols:
    if not isinstance(symbol, dict):
      continue
    normalized_symbols.append(
      normalize_symbol_for_ai_output(symbol, runtime_path_by_container_id)
    )
  return normalized_symbols


def should_skip_deprecated_api_symbol(symbol: dict[str, Any]) -> bool:
  """判断符号是否应按弃用 API 规则过滤。"""

  symbol_kind = normalize_search_keyword(str(symbol.get("kind") or ""))
  if symbol_kind not in DEPRECATED_API_CALLABLE_KINDS:
    return False

  symbol_name = str(symbol.get("name") or "").strip()
  symbol_owner = str(symbol.get("ownerFullName") or "").strip()
  symbol_full_name = str(symbol.get("fullName") or "").strip()

  if symbol_full_name and symbol_full_name in DEPRECATED_API_FULL_NAME_MATCHERS:
    return True

  if (
    symbol_owner
    and symbol_name
    and (symbol_owner, symbol_name) in DEPRECATED_API_OWNER_NAME_MATCHERS
  ):
    return True

  if symbol_name and symbol_name in DEPRECATED_API_NAME_MATCHERS:
    return True

  return False


def filter_deprecated_api_symbols(symbols: list[dict[str, Any]]) -> list[dict[str, Any]]:
  """过滤配置中声明的弃用 API 符号。"""

  filtered_symbols: list[dict[str, Any]] = []
  for symbol in symbols:
    if should_skip_deprecated_api_symbol(symbol):
      continue
    filtered_symbols.append(symbol)
  return filtered_symbols


def filter_hollow_symbols(symbols: list[dict[str, Any]]) -> list[dict[str, Any]]:
  """过滤 name/fullName 均为空的空壳条目。"""

  filtered_symbols: list[dict[str, Any]] = []
  for symbol in symbols:
    symbol_name = str(symbol.get("name") or "").strip()
    symbol_full_name = str(symbol.get("fullName") or "").strip()
    if not symbol_name and not symbol_full_name:
      continue
    filtered_symbols.append(symbol)

  return filtered_symbols


def build_ts_extractor_script() -> str:
    """构建 TypeScript AST 抽取脚本源码。

    Returns:
        str: 传递给 `node -e` 的 JavaScript 源码。
    """

    return r"""
const fs = require('fs');

const tsModulePath = process.argv[1];
const dtsPath = process.argv[2];
const ts = require(tsModulePath);

const compilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.CommonJS,
  skipLibCheck: true,
  noResolve: false,
  strict: false,
};

const program = ts.createProgram([dtsPath], compilerOptions);
const checker = program.getTypeChecker();
const sourceFile = program.getSourceFile(dtsPath);

if (!sourceFile) {
  throw new Error(`无法加载源文件: ${dtsPath}`);
}

const sourceText = sourceFile.getFullText();
const symbols = [];
let symbolId = 1;

const symbolNameIndex = Object.create(null);
const symbolKindIndex = Object.create(null);

function commentToString(comment) {
  if (!comment) {
    return '';
  }
  if (typeof comment === 'string') {
    return comment;
  }
  if (Array.isArray(comment)) {
    return comment
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join('');
  }
  return '';
}

function getNodeName(node) {
  if (!node) {
    return '';
  }

  if (node.name && typeof node.name.getText === 'function') {
    return node.name.getText(sourceFile);
  }

  if (node.kind === ts.SyntaxKind.Constructor) {
    return 'constructor';
  }

  return '';
}

function normalizeLocation(node) {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile, false));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
}

function extractJsDoc(node) {
  const docs = [];
  const blocks = node.jsDoc || [];

  for (const block of blocks) {
    const tags = [];
    if (block.tags) {
      for (const tag of block.tags) {
        tags.push({
          tagName: tag.tagName ? tag.tagName.getText(sourceFile) : '',
          name: tag.name ? tag.name.getText(sourceFile) : '',
          text: commentToString(tag.comment),
        });
      }
    }

    docs.push({
      comment: commentToString(block.comment),
      tags,
    });
  }

  const summary = docs
    .map((item) => item.comment)
    .filter((item) => typeof item === 'string' && item.length > 0)
    .join('\n\n');

  return {
    summary,
    blocks: docs,
  };
}

function extractHeritage(node) {
  if (!node.heritageClauses || node.heritageClauses.length === 0) {
    return [];
  }

  const clauses = [];
  for (const clause of node.heritageClauses) {
    clauses.push({
      relation: clause.token === ts.SyntaxKind.ExtendsKeyword ? 'extends' : 'implements',
      types: clause.types.map((item) => item.getText(sourceFile)),
    });
  }
  return clauses;
}

function extractTypeParameters(node) {
  if (!node.typeParameters || node.typeParameters.length === 0) {
    return [];
  }

  return node.typeParameters.map((item) => ({
    name: item.name ? item.name.getText(sourceFile) : '',
    constraint: item.constraint ? item.constraint.getText(sourceFile) : '',
    defaultType: item.default ? item.default.getText(sourceFile) : '',
  }));
}

function extractParameters(node) {
  if (!node.parameters || node.parameters.length === 0) {
    return [];
  }

  return node.parameters.map((param) => ({
    name: param.name ? param.name.getText(sourceFile) : '',
    type: param.type ? param.type.getText(sourceFile) : '',
    optional: !!param.questionToken,
    rest: !!param.dotDotDotToken,
    initializer: param.initializer ? param.initializer.getText(sourceFile) : '',
  }));
}

function extractReturnType(node) {
  if (node.type) {
    return node.type.getText(sourceFile);
  }

  try {
    const signature = checker.getSignatureFromDeclaration(node);
    if (signature) {
      return checker.typeToString(checker.getReturnTypeOfSignature(signature));
    }
  } catch (_error) {
    return '';
  }

  return '';
}

function detectContainer(node) {
  if (
    ts.isModuleDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return true;
  }
  return false;
}

function classify(node) {
  if (ts.isModuleDeclaration(node)) {
    return 'namespace';
  }
  if (ts.isClassDeclaration(node)) {
    return 'class';
  }
  if (ts.isInterfaceDeclaration(node)) {
    return 'interface';
  }
  if (ts.isTypeAliasDeclaration(node)) {
    return 'typeAlias';
  }
  if (ts.isEnumDeclaration(node)) {
    return 'enum';
  }
  if (ts.isEnumMember(node)) {
    return 'enumMember';
  }
  if (ts.isFunctionDeclaration(node)) {
    return 'function';
  }
  if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
    return 'method';
  }
  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) {
    return 'property';
  }
  if (ts.isConstructSignatureDeclaration(node) || ts.isConstructorDeclaration(node)) {
    return 'constructor';
  }
  if (ts.isCallSignatureDeclaration(node)) {
    return 'callSignature';
  }
  if (ts.isIndexSignatureDeclaration(node)) {
    return 'indexSignature';
  }
  if (ts.isGetAccessorDeclaration(node)) {
    return 'getter';
  }
  if (ts.isSetAccessorDeclaration(node)) {
    return 'setter';
  }
  if (ts.isVariableDeclaration(node)) {
    return 'variable';
  }
  return '';
}

function isTrackedDeclaration(node) {
  if (
    ts.isModuleDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isEnumMember(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isConstructSignatureDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isCallSignatureDeclaration(node) ||
    ts.isIndexSignatureDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isVariableDeclaration(node)
  ) {
    return true;
  }

  return false;
}

function appendIndex(index, key, value) {
  if (!key) {
    return;
  }
  if (!index[key]) {
    index[key] = [];
  }
  index[key].push(value);
}

function serializeNode(node, containerStack, parentId) {
  const kind = classify(node);
  const nodeName = getNodeName(node);
  const owner = containerStack.length > 0 ? containerStack[containerStack.length - 1] : null;
  const fullName = owner && nodeName ? `${owner.fullName}.${nodeName}` : nodeName;

  const location = normalizeLocation(node);
  const jsDoc = extractJsDoc(node);
  const typeParameters = extractTypeParameters(node);
  const parameters = extractParameters(node);
  const returnType = extractReturnType(node);

  let typeText = '';
  if (node.type && typeof node.type.getText === 'function') {
    typeText = node.type.getText(sourceFile);
  } else if (ts.isVariableDeclaration(node)) {
    try {
      const t = checker.getTypeAtLocation(node);
      typeText = checker.typeToString(t);
    } catch (_error) {
      typeText = '';
    }
  }

  let signatureText = '';
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isConstructSignatureDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isCallSignatureDeclaration(node) ||
    ts.isIndexSignatureDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    signatureText = node.getText(sourceFile);
  }

  let enumValue = '';
  if (ts.isEnumMember(node) && node.initializer) {
    enumValue = node.initializer.getText(sourceFile);
  }

  let initializerText = '';
  if (ts.isVariableDeclaration(node) && node.initializer) {
    initializerText = node.initializer.getText(sourceFile);
  }

  const item = {
    id: symbolId++,
    kind,
    tsKind: ts.SyntaxKind[node.kind],
    name: nodeName,
    fullName,
    parentId,
    ownerId: owner ? owner.id : null,
    ownerFullName: owner ? owner.fullName : '',
    location,
    modifiers: (node.modifiers || []).map((m) => ts.SyntaxKind[m.kind]),
    typeText,
    signatureText,
    returnType,
    parameters,
    typeParameters,
    heritage: extractHeritage(node),
    enumValue,
    initializerText,
    jsDoc,
  };

  symbols.push(item);
  appendIndex(symbolNameIndex, item.name, item.id);
  appendIndex(symbolKindIndex, item.kind, item.id);

  return item;
}

function visit(node, containerStack, parentId) {
  let currentParentId = parentId;
  let nextContainerStack = containerStack;

  if (isTrackedDeclaration(node)) {
    const symbol = serializeNode(node, containerStack, parentId);
    currentParentId = symbol.id;

    if (detectContainer(node) && symbol.fullName) {
      nextContainerStack = [...containerStack, { id: symbol.id, fullName: symbol.fullName }];
    }
  }

  ts.forEachChild(node, (child) => visit(child, nextContainerStack, currentParentId));
}

visit(sourceFile, [], null);

const diagnostics = ts.getPreEmitDiagnostics(program)
  .filter((d) => d.file && d.file.fileName === dtsPath)
  .map((d) => {
    const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    if (!d.file || typeof d.start !== 'number') {
      return { message };
    }
    const pos = d.file.getLineAndCharacterOfPosition(d.start);
    return {
      message,
      line: pos.line + 1,
      column: pos.character + 1,
    };
  });

function countLinesLikePythonSplitlines(text) {
  if (!text) {
    return 0;
  }
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.length;
}

const result = {
  typescriptVersion: ts.version,
  diagnostics,
  symbolNameIndex,
  symbolKindIndex,
  symbols,
  lineCount: countLinesLikePythonSplitlines(sourceText),
  charCount: sourceText.length,
};

process.stdout.write(JSON.stringify(result));
"""


def run_ts_extractor(config: GeneratorConfig) -> dict[str, Any]:
    """调用 Node.js + TypeScript AST 解析器并返回抽取结果。

    Args:
        config: 生成配置。

    Returns:
        dict[str, Any]: 解析得到的中间数据。

    Raises:
        RuntimeError: Node 进程执行失败或返回内容非法时抛出。
    """

    script = build_ts_extractor_script()

    process = subprocess.run(
        [
            "node",
            "-e",
            script,
            str(config.typescript_module_path),
            str(config.input_path),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    if process.returncode != 0:
        raise RuntimeError(
            "TypeScript AST 抽取失败：\n"
            f"stdout:\n{process.stdout}\n"
            f"stderr:\n{process.stderr}"
        )

    try:
        return json.loads(process.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"解析 Node 输出 JSON 失败：{error}") from error


def build_query_indexes(symbols: list[dict[str, Any]]) -> dict[str, Any]:
    """构建面向大模型查询的索引结构。"""
    symbol_id_by_keyword: dict[str, list[int]] = {}

    for symbol in symbols:
        symbol_id = symbol.get("id")
        if not isinstance(symbol_id, int):
            continue

        for keyword in build_symbol_search_keywords(symbol):
            append_symbol_id_to_keyword_index(symbol_id_by_keyword, keyword, symbol_id)

    return {
        "symbolIdByKeyword": symbol_id_by_keyword,
    }


def build_api_projection(symbols: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """构建精简查询投影，降低大模型检索时的 token 开销。"""

    callable_kinds = {
        "function",
        "method",
        "constructor",
        "callSignature",
        "getter",
        "setter",
    }
    type_kinds = {
        "class",
        "interface",
        "typeAlias",
        "enum",
        "enumMember",
        "property",
        "indexSignature",
        "variable",
    }

    callable_apis: list[dict[str, Any]] = []
    types: list[dict[str, Any]] = []

    for symbol in symbols:
        base_item = {
            "id": symbol.get("id"),
            "name": symbol.get("name"),
            "fullName": symbol.get("fullName"),
            "kind": symbol.get("kind"),
            "ownerFullName": symbol.get("ownerFullName"),
            "summary": (symbol.get("jsDoc") or {}).get("summary", ""),
        }

        if symbol.get("kind") in callable_kinds:
            callable_apis.append(
                {
                    **base_item,
                    "signatureText": symbol.get("signatureText", ""),
                    "parameters": symbol.get("parameters", []),
                    "returnType": symbol.get("returnType", ""),
                }
            )

        if symbol.get("kind") in type_kinds:
            types.append(
                {
                    **base_item,
                    "typeText": symbol.get("typeText", ""),
                }
            )

    return {
        "callableApis": callable_apis,
        "types": types,
    }


def build_final_document(
    config: GeneratorConfig,
    ast_result: dict[str, Any],
) -> dict[str, Any]:
  """组装最终 JSON 文档。"""

  symbols = normalize_symbols_for_ai_output(ast_result.get("symbols", []))
  symbols = filter_deprecated_api_symbols(symbols)
  symbols = filter_hollow_symbols(symbols)
  query_indexes = build_query_indexes(symbols)
  projections = build_api_projection(symbols)

  return {
    "queryIndexes": query_indexes,
    "projections": projections,
  }


def write_json(output_path: Path, data: dict[str, Any], indent: int) -> None:
    """将结果写入 JSON 文件。"""

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=indent),
        encoding="utf-8",
    )


def write_sync_outputs(
    output_paths: tuple[Path, ...],
    primary_output_path: Path,
    data: dict[str, Any],
    indent: int,
) -> None:
    """将生成结果同步写入额外路径。"""

    primary_resolved = primary_output_path.resolve()
    for output_path in output_paths:
        if output_path.resolve() == primary_resolved:
            continue
        write_json(output_path, data, indent)


def validate_paths(config: GeneratorConfig) -> None:
    """校验输入路径与依赖路径，失败时抛出可读错误。"""

    if not config.input_path.exists():
        raise FileNotFoundError(f"未找到输入文件：{config.input_path}")

    if not config.typescript_module_path.exists():
        raise FileNotFoundError(
            f"未找到 TypeScript 模块：{config.typescript_module_path}"
        )


def main() -> int:
    """主入口：执行完整文档生成流程。

    Returns:
        int: 0 表示成功，非 0 表示失败。
    """

    try:
        config = parse_args()
        validate_paths(config)

        ast_result = run_ts_extractor(config)

        document = build_final_document(
            config=config,
            ast_result=ast_result,
        )
        write_json(config.output_path, document, config.indent)
        write_sync_outputs(
            output_paths=config.sync_output_paths,
            primary_output_path=config.output_path,
            data=document,
            indent=config.indent,
        )

        print(f"生成成功：{config.output_path}")
        if config.sync_output_paths:
            print(
                "同步输出："
                + ", ".join(str(path) for path in config.sync_output_paths)
            )
        projections = document.get("projections", {})
        callable_count = len(projections.get("callableApis", []))
        type_count = len(projections.get("types", []))
        print(f"总符号数：{len(ast_result.get('symbols', []))}")
        print(f"可调用 API 数：{callable_count}")
        print(f"类型符号数：{type_count}")
        return 0
    except Exception as error:  # noqa: BLE001
        print(f"生成失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
