//#region node_modules/.pnpm/@lit+reactive-element@2.1.2/node_modules/@lit/reactive-element/css-tag.js
var e = globalThis, t = e.ShadowRoot && (e.ShadyCSS === void 0 || e.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, n = Symbol(), r = /* @__PURE__ */ new WeakMap(), i = class {
	constructor(e, t, r) {
		if (this._$cssResult$ = !0, r !== n) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
		this.cssText = e, this.t = t;
	}
	get styleSheet() {
		let e = this.o, n = this.t;
		if (t && e === void 0) {
			let t = n !== void 0 && n.length === 1;
			t && (e = r.get(n)), e === void 0 && ((this.o = e = new CSSStyleSheet()).replaceSync(this.cssText), t && r.set(n, e));
		}
		return e;
	}
	toString() {
		return this.cssText;
	}
}, a = (e) => new i(typeof e == "string" ? e : e + "", void 0, n), o = (e, ...t) => new i(e.length === 1 ? e[0] : t.reduce((t, n, r) => t + ((e) => {
	if (!0 === e._$cssResult$) return e.cssText;
	if (typeof e == "number") return e;
	throw Error("Value passed to 'css' function must be a 'css' function result: " + e + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
})(n) + e[r + 1], e[0]), e, n), s = (n, r) => {
	if (t) n.adoptedStyleSheets = r.map((e) => e instanceof CSSStyleSheet ? e : e.styleSheet);
	else for (let t of r) {
		let r = document.createElement("style"), i = e.litNonce;
		i !== void 0 && r.setAttribute("nonce", i), r.textContent = t.cssText, n.appendChild(r);
	}
}, c = t ? (e) => e : (e) => e instanceof CSSStyleSheet ? ((e) => {
	let t = "";
	for (let n of e.cssRules) t += n.cssText;
	return a(t);
})(e) : e, { is: l, defineProperty: u, getOwnPropertyDescriptor: d, getOwnPropertyNames: ee, getOwnPropertySymbols: te, getPrototypeOf: ne } = Object, f = globalThis, p = f.trustedTypes, re = p ? p.emptyScript : "", ie = f.reactiveElementPolyfillSupport, m = (e, t) => e, h = {
	toAttribute(e, t) {
		switch (t) {
			case Boolean:
				e = e ? re : null;
				break;
			case Object:
			case Array: e = e == null ? e : JSON.stringify(e);
		}
		return e;
	},
	fromAttribute(e, t) {
		let n = e;
		switch (t) {
			case Boolean:
				n = e !== null;
				break;
			case Number:
				n = e === null ? null : Number(e);
				break;
			case Object:
			case Array: try {
				n = JSON.parse(e);
			} catch {
				n = null;
			}
		}
		return n;
	}
}, g = (e, t) => !l(e, t), _ = {
	attribute: !0,
	type: String,
	converter: h,
	reflect: !1,
	useDefault: !1,
	hasChanged: g
};
Symbol.metadata ??= Symbol("metadata"), f.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
var v = class extends HTMLElement {
	static addInitializer(e) {
		this._$Ei(), (this.l ??= []).push(e);
	}
	static get observedAttributes() {
		return this.finalize(), this._$Eh && [...this._$Eh.keys()];
	}
	static createProperty(e, t = _) {
		if (t.state && (t.attribute = !1), this._$Ei(), this.prototype.hasOwnProperty(e) && ((t = Object.create(t)).wrapped = !0), this.elementProperties.set(e, t), !t.noAccessor) {
			let n = Symbol(), r = this.getPropertyDescriptor(e, n, t);
			r !== void 0 && u(this.prototype, e, r);
		}
	}
	static getPropertyDescriptor(e, t, n) {
		let { get: r, set: i } = d(this.prototype, e) ?? {
			get() {
				return this[t];
			},
			set(e) {
				this[t] = e;
			}
		};
		return {
			get: r,
			set(t) {
				let a = r?.call(this);
				i?.call(this, t), this.requestUpdate(e, a, n);
			},
			configurable: !0,
			enumerable: !0
		};
	}
	static getPropertyOptions(e) {
		return this.elementProperties.get(e) ?? _;
	}
	static _$Ei() {
		if (this.hasOwnProperty(m("elementProperties"))) return;
		let e = ne(this);
		e.finalize(), e.l !== void 0 && (this.l = [...e.l]), this.elementProperties = new Map(e.elementProperties);
	}
	static finalize() {
		if (this.hasOwnProperty(m("finalized"))) return;
		if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(m("properties"))) {
			let e = this.properties, t = [...ee(e), ...te(e)];
			for (let n of t) this.createProperty(n, e[n]);
		}
		let e = this[Symbol.metadata];
		if (e !== null) {
			let t = litPropertyMetadata.get(e);
			if (t !== void 0) for (let [e, n] of t) this.elementProperties.set(e, n);
		}
		this._$Eh = /* @__PURE__ */ new Map();
		for (let [e, t] of this.elementProperties) {
			let n = this._$Eu(e, t);
			n !== void 0 && this._$Eh.set(n, e);
		}
		this.elementStyles = this.finalizeStyles(this.styles);
	}
	static finalizeStyles(e) {
		let t = [];
		if (Array.isArray(e)) {
			let n = new Set(e.flat(Infinity).reverse());
			for (let e of n) t.unshift(c(e));
		} else e !== void 0 && t.push(c(e));
		return t;
	}
	static _$Eu(e, t) {
		let n = t.attribute;
		return !1 === n ? void 0 : typeof n == "string" ? n : typeof e == "string" ? e.toLowerCase() : void 0;
	}
	constructor() {
		super(), this._$Ep = void 0, this.isUpdatePending = !1, this.hasUpdated = !1, this._$Em = null, this._$Ev();
	}
	_$Ev() {
		this._$ES = new Promise((e) => this.enableUpdating = e), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((e) => e(this));
	}
	addController(e) {
		(this._$EO ??= /* @__PURE__ */ new Set()).add(e), this.renderRoot !== void 0 && this.isConnected && e.hostConnected?.();
	}
	removeController(e) {
		this._$EO?.delete(e);
	}
	_$E_() {
		let e = /* @__PURE__ */ new Map(), t = this.constructor.elementProperties;
		for (let n of t.keys()) this.hasOwnProperty(n) && (e.set(n, this[n]), delete this[n]);
		e.size > 0 && (this._$Ep = e);
	}
	createRenderRoot() {
		let e = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
		return s(e, this.constructor.elementStyles), e;
	}
	connectedCallback() {
		this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(!0), this._$EO?.forEach((e) => e.hostConnected?.());
	}
	enableUpdating(e) {}
	disconnectedCallback() {
		this._$EO?.forEach((e) => e.hostDisconnected?.());
	}
	attributeChangedCallback(e, t, n) {
		this._$AK(e, n);
	}
	_$ET(e, t) {
		let n = this.constructor.elementProperties.get(e), r = this.constructor._$Eu(e, n);
		if (r !== void 0 && !0 === n.reflect) {
			let i = (n.converter?.toAttribute === void 0 ? h : n.converter).toAttribute(t, n.type);
			this._$Em = e, i == null ? this.removeAttribute(r) : this.setAttribute(r, i), this._$Em = null;
		}
	}
	_$AK(e, t) {
		let n = this.constructor, r = n._$Eh.get(e);
		if (r !== void 0 && this._$Em !== r) {
			let e = n.getPropertyOptions(r), i = typeof e.converter == "function" ? { fromAttribute: e.converter } : e.converter?.fromAttribute === void 0 ? h : e.converter;
			this._$Em = r;
			let a = i.fromAttribute(t, e.type);
			this[r] = a ?? this._$Ej?.get(r) ?? a, this._$Em = null;
		}
	}
	requestUpdate(e, t, n, r = !1, i) {
		if (e !== void 0) {
			let a = this.constructor;
			if (!1 === r && (i = this[e]), n ??= a.getPropertyOptions(e), !((n.hasChanged ?? g)(i, t) || n.useDefault && n.reflect && i === this._$Ej?.get(e) && !this.hasAttribute(a._$Eu(e, n)))) return;
			this.C(e, t, n);
		}
		!1 === this.isUpdatePending && (this._$ES = this._$EP());
	}
	C(e, t, { useDefault: n, reflect: r, wrapped: i }, a) {
		n && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(e) && (this._$Ej.set(e, a ?? t ?? this[e]), !0 !== i || a !== void 0) || (this._$AL.has(e) || (this.hasUpdated || n || (t = void 0), this._$AL.set(e, t)), !0 === r && this._$Em !== e && (this._$Eq ??= /* @__PURE__ */ new Set()).add(e));
	}
	async _$EP() {
		this.isUpdatePending = !0;
		try {
			await this._$ES;
		} catch (e) {
			Promise.reject(e);
		}
		let e = this.scheduleUpdate();
		return e != null && await e, !this.isUpdatePending;
	}
	scheduleUpdate() {
		return this.performUpdate();
	}
	performUpdate() {
		if (!this.isUpdatePending) return;
		if (!this.hasUpdated) {
			if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
				for (let [e, t] of this._$Ep) this[e] = t;
				this._$Ep = void 0;
			}
			let e = this.constructor.elementProperties;
			if (e.size > 0) for (let [t, n] of e) {
				let { wrapped: e } = n, r = this[t];
				!0 !== e || this._$AL.has(t) || r === void 0 || this.C(t, void 0, n, r);
			}
		}
		let e = !1, t = this._$AL;
		try {
			e = this.shouldUpdate(t), e ? (this.willUpdate(t), this._$EO?.forEach((e) => e.hostUpdate?.()), this.update(t)) : this._$EM();
		} catch (t) {
			throw e = !1, this._$EM(), t;
		}
		e && this._$AE(t);
	}
	willUpdate(e) {}
	_$AE(e) {
		this._$EO?.forEach((e) => e.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = !0, this.firstUpdated(e)), this.updated(e);
	}
	_$EM() {
		this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = !1;
	}
	get updateComplete() {
		return this.getUpdateComplete();
	}
	getUpdateComplete() {
		return this._$ES;
	}
	shouldUpdate(e) {
		return !0;
	}
	update(e) {
		this._$Eq &&= this._$Eq.forEach((e) => this._$ET(e, this[e])), this._$EM();
	}
	updated(e) {}
	firstUpdated(e) {}
};
v.elementStyles = [], v.shadowRootOptions = { mode: "open" }, v[m("elementProperties")] = /* @__PURE__ */ new Map(), v[m("finalized")] = /* @__PURE__ */ new Map(), ie?.({ ReactiveElement: v }), (f.reactiveElementVersions ??= []).push("2.1.2");
//#endregion
//#region node_modules/.pnpm/lit-html@3.3.3/node_modules/lit-html/lit-html.js
var y = globalThis, ae = (e) => e, b = y.trustedTypes, x = b ? b.createPolicy("lit-html", { createHTML: (e) => e }) : void 0, S = "$lit$", C = `lit$${Math.random().toFixed(9).slice(2)}$`, w = "?" + C, oe = `<${w}>`, T = document, E = () => T.createComment(""), D = (e) => e === null || typeof e != "object" && typeof e != "function", O = Array.isArray, se = (e) => O(e) || typeof e?.[Symbol.iterator] == "function", k = "[ 	\n\f\r]", A = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, j = /-->/g, ce = />/g, M = RegExp(`>|${k}(?:([^\\s"'>=/]+)(${k}*=${k}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`, "g"), N = /'/g, P = /"/g, F = /^(?:script|style|textarea|title)$/i, I = ((e) => (t, ...n) => ({
	_$litType$: e,
	strings: t,
	values: n
}))(1), L = Symbol.for("lit-noChange"), R = Symbol.for("lit-nothing"), z = /* @__PURE__ */ new WeakMap(), B = T.createTreeWalker(T, 129);
function V(e, t) {
	if (!O(e) || !e.hasOwnProperty("raw")) throw Error("invalid template strings array");
	return x === void 0 ? t : x.createHTML(t);
}
var le = (e, t) => {
	let n = e.length - 1, r = [], i, a = t === 2 ? "<svg>" : t === 3 ? "<math>" : "", o = A;
	for (let t = 0; t < n; t++) {
		let n = e[t], s, c, l = -1, u = 0;
		for (; u < n.length && (o.lastIndex = u, c = o.exec(n), c !== null);) u = o.lastIndex, o === A ? c[1] === "!--" ? o = j : c[1] === void 0 ? c[2] === void 0 ? c[3] !== void 0 && (o = M) : (F.test(c[2]) && (i = RegExp("</" + c[2], "g")), o = M) : o = ce : o === M ? c[0] === ">" ? (o = i ?? A, l = -1) : c[1] === void 0 ? l = -2 : (l = o.lastIndex - c[2].length, s = c[1], o = c[3] === void 0 ? M : c[3] === "\"" ? P : N) : o === P || o === N ? o = M : o === j || o === ce ? o = A : (o = M, i = void 0);
		let d = o === M && e[t + 1].startsWith("/>") ? " " : "";
		a += o === A ? n + oe : l >= 0 ? (r.push(s), n.slice(0, l) + S + n.slice(l) + C + d) : n + C + (l === -2 ? t : d);
	}
	return [V(e, a + (e[n] || "<?>") + (t === 2 ? "</svg>" : t === 3 ? "</math>" : "")), r];
}, H = class e {
	constructor({ strings: t, _$litType$: n }, r) {
		let i;
		this.parts = [];
		let a = 0, o = 0, s = t.length - 1, c = this.parts, [l, u] = le(t, n);
		if (this.el = e.createElement(l, r), B.currentNode = this.el.content, n === 2 || n === 3) {
			let e = this.el.content.firstChild;
			e.replaceWith(...e.childNodes);
		}
		for (; (i = B.nextNode()) !== null && c.length < s;) {
			if (i.nodeType === 1) {
				if (i.hasAttributes()) for (let e of i.getAttributeNames()) if (e.endsWith(S)) {
					let t = u[o++], n = i.getAttribute(e).split(C), r = /([.?@])?(.*)/.exec(t);
					c.push({
						type: 1,
						index: a,
						name: r[2],
						strings: n,
						ctor: r[1] === "." ? de : r[1] === "?" ? fe : r[1] === "@" ? pe : G
					}), i.removeAttribute(e);
				} else e.startsWith(C) && (c.push({
					type: 6,
					index: a
				}), i.removeAttribute(e));
				if (F.test(i.tagName)) {
					let e = i.textContent.split(C), t = e.length - 1;
					if (t > 0) {
						i.textContent = b ? b.emptyScript : "";
						for (let n = 0; n < t; n++) i.append(e[n], E()), B.nextNode(), c.push({
							type: 2,
							index: ++a
						});
						i.append(e[t], E());
					}
				}
			} else if (i.nodeType === 8) if (i.data === w) c.push({
				type: 2,
				index: a
			});
			else {
				let e = -1;
				for (; (e = i.data.indexOf(C, e + 1)) !== -1;) c.push({
					type: 7,
					index: a
				}), e += C.length - 1;
			}
			a++;
		}
	}
	static createElement(e, t) {
		let n = T.createElement("template");
		return n.innerHTML = e, n;
	}
};
function U(e, t, n = e, r) {
	if (t === L) return t;
	let i = r === void 0 ? n._$Cl : n._$Co?.[r], a = D(t) ? void 0 : t._$litDirective$;
	return i?.constructor !== a && (i?._$AO?.(!1), a === void 0 ? i = void 0 : (i = new a(e), i._$AT(e, n, r)), r === void 0 ? n._$Cl = i : (n._$Co ??= [])[r] = i), i !== void 0 && (t = U(e, i._$AS(e, t.values), i, r)), t;
}
var ue = class {
	constructor(e, t) {
		this._$AV = [], this._$AN = void 0, this._$AD = e, this._$AM = t;
	}
	get parentNode() {
		return this._$AM.parentNode;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	u(e) {
		let { el: { content: t }, parts: n } = this._$AD, r = (e?.creationScope ?? T).importNode(t, !0);
		B.currentNode = r;
		let i = B.nextNode(), a = 0, o = 0, s = n[0];
		for (; s !== void 0;) {
			if (a === s.index) {
				let t;
				s.type === 2 ? t = new W(i, i.nextSibling, this, e) : s.type === 1 ? t = new s.ctor(i, s.name, s.strings, this, e) : s.type === 6 && (t = new me(i, this, e)), this._$AV.push(t), s = n[++o];
			}
			a !== s?.index && (i = B.nextNode(), a++);
		}
		return B.currentNode = T, r;
	}
	p(e) {
		let t = 0;
		for (let n of this._$AV) n !== void 0 && (n.strings === void 0 ? n._$AI(e[t]) : (n._$AI(e, n, t), t += n.strings.length - 2)), t++;
	}
}, W = class e {
	get _$AU() {
		return this._$AM?._$AU ?? this._$Cv;
	}
	constructor(e, t, n, r) {
		this.type = 2, this._$AH = R, this._$AN = void 0, this._$AA = e, this._$AB = t, this._$AM = n, this.options = r, this._$Cv = r?.isConnected ?? !0;
	}
	get parentNode() {
		let e = this._$AA.parentNode, t = this._$AM;
		return t !== void 0 && e?.nodeType === 11 && (e = t.parentNode), e;
	}
	get startNode() {
		return this._$AA;
	}
	get endNode() {
		return this._$AB;
	}
	_$AI(e, t = this) {
		e = U(this, e, t), D(e) ? e === R || e == null || e === "" ? (this._$AH !== R && this._$AR(), this._$AH = R) : e !== this._$AH && e !== L && this._(e) : e._$litType$ === void 0 ? e.nodeType === void 0 ? se(e) ? this.k(e) : this._(e) : this.T(e) : this.$(e);
	}
	O(e) {
		return this._$AA.parentNode.insertBefore(e, this._$AB);
	}
	T(e) {
		this._$AH !== e && (this._$AR(), this._$AH = this.O(e));
	}
	_(e) {
		this._$AH !== R && D(this._$AH) ? this._$AA.nextSibling.data = e : this.T(T.createTextNode(e)), this._$AH = e;
	}
	$(e) {
		let { values: t, _$litType$: n } = e, r = typeof n == "number" ? this._$AC(e) : (n.el === void 0 && (n.el = H.createElement(V(n.h, n.h[0]), this.options)), n);
		if (this._$AH?._$AD === r) this._$AH.p(t);
		else {
			let e = new ue(r, this), n = e.u(this.options);
			e.p(t), this.T(n), this._$AH = e;
		}
	}
	_$AC(e) {
		let t = z.get(e.strings);
		return t === void 0 && z.set(e.strings, t = new H(e)), t;
	}
	k(t) {
		O(this._$AH) || (this._$AH = [], this._$AR());
		let n = this._$AH, r, i = 0;
		for (let a of t) i === n.length ? n.push(r = new e(this.O(E()), this.O(E()), this, this.options)) : r = n[i], r._$AI(a), i++;
		i < n.length && (this._$AR(r && r._$AB.nextSibling, i), n.length = i);
	}
	_$AR(e = this._$AA.nextSibling, t) {
		for (this._$AP?.(!1, !0, t); e !== this._$AB;) {
			let t = ae(e).nextSibling;
			ae(e).remove(), e = t;
		}
	}
	setConnected(e) {
		this._$AM === void 0 && (this._$Cv = e, this._$AP?.(e));
	}
}, G = class {
	get tagName() {
		return this.element.tagName;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	constructor(e, t, n, r, i) {
		this.type = 1, this._$AH = R, this._$AN = void 0, this.element = e, this.name = t, this._$AM = r, this.options = i, n.length > 2 || n[0] !== "" || n[1] !== "" ? (this._$AH = Array(n.length - 1).fill(/* @__PURE__ */ new String()), this.strings = n) : this._$AH = R;
	}
	_$AI(e, t = this, n, r) {
		let i = this.strings, a = !1;
		if (i === void 0) e = U(this, e, t, 0), a = !D(e) || e !== this._$AH && e !== L, a && (this._$AH = e);
		else {
			let r = e, o, s;
			for (e = i[0], o = 0; o < i.length - 1; o++) s = U(this, r[n + o], t, o), s === L && (s = this._$AH[o]), a ||= !D(s) || s !== this._$AH[o], s === R ? e = R : e !== R && (e += (s ?? "") + i[o + 1]), this._$AH[o] = s;
		}
		a && !r && this.j(e);
	}
	j(e) {
		e === R ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, e ?? "");
	}
}, de = class extends G {
	constructor() {
		super(...arguments), this.type = 3;
	}
	j(e) {
		this.element[this.name] = e === R ? void 0 : e;
	}
}, fe = class extends G {
	constructor() {
		super(...arguments), this.type = 4;
	}
	j(e) {
		this.element.toggleAttribute(this.name, !!e && e !== R);
	}
}, pe = class extends G {
	constructor(e, t, n, r, i) {
		super(e, t, n, r, i), this.type = 5;
	}
	_$AI(e, t = this) {
		if ((e = U(this, e, t, 0) ?? R) === L) return;
		let n = this._$AH, r = e === R && n !== R || e.capture !== n.capture || e.once !== n.once || e.passive !== n.passive, i = e !== R && (n === R || r);
		r && this.element.removeEventListener(this.name, this, n), i && this.element.addEventListener(this.name, this, e), this._$AH = e;
	}
	handleEvent(e) {
		typeof this._$AH == "function" ? this._$AH.call(this.options?.host ?? this.element, e) : this._$AH.handleEvent(e);
	}
}, me = class {
	constructor(e, t, n) {
		this.element = e, this.type = 6, this._$AN = void 0, this._$AM = t, this.options = n;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	_$AI(e) {
		U(this, e);
	}
}, he = y.litHtmlPolyfillSupport;
he?.(H, W), (y.litHtmlVersions ??= []).push("3.3.3");
var ge = (e, t, n) => {
	let r = n?.renderBefore ?? t, i = r._$litPart$;
	if (i === void 0) {
		let e = n?.renderBefore ?? null;
		r._$litPart$ = i = new W(t.insertBefore(E(), e), e, void 0, n ?? {});
	}
	return i._$AI(e), i;
}, K = globalThis, q = class extends v {
	constructor() {
		super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
	}
	createRenderRoot() {
		let e = super.createRenderRoot();
		return this.renderOptions.renderBefore ??= e.firstChild, e;
	}
	update(e) {
		let t = this.render();
		this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(e), this._$Do = ge(t, this.renderRoot, this.renderOptions);
	}
	connectedCallback() {
		super.connectedCallback(), this._$Do?.setConnected(!0);
	}
	disconnectedCallback() {
		super.disconnectedCallback(), this._$Do?.setConnected(!1);
	}
	render() {
		return L;
	}
};
q._$litElement$ = !0, q.finalized = !0, K.litElementHydrateSupport?.({ LitElement: q });
var _e = K.litElementPolyfillSupport;
_e?.({ LitElement: q }), (K.litElementVersions ??= []).push("4.2.2");
//#endregion
//#region src/localize/localize.ts
var ve = {
	en: {
		dayOne: "day",
		dayFew: "days",
		dayMany: "days",
		remaining: "remaining",
		overdue: "overdue",
		due: "due today",
		warning: "due soon",
		lastCompleted: "Last completed",
		dueDate: "Due",
		notFound: "Task not found",
		configure: "Configure",
		complete: "Complete",
		cancel: "Cancel",
		confirmTitle: "Complete now?",
		backendError: "Could not save completion. Please try again."
	},
	ru: {
		dayOne: "день",
		dayFew: "дня",
		dayMany: "дней",
		remaining: "осталось",
		overdue: "просрочено",
		due: "сегодня",
		warning: "скоро",
		lastCompleted: "Последнее выполнение",
		dueDate: "Срок",
		notFound: "Задача не найдена",
		configure: "Настроить",
		complete: "Выполнено",
		cancel: "Отмена",
		confirmTitle: "Выполнено сейчас?",
		backendError: "Не удалось сохранить выполнение. Попробуйте ещё раз."
	}
};
function J(e) {
	return e?.toLowerCase().startsWith("ru") ? "ru" : "en";
}
function Y(e, t) {
	return ve[J(e)][t];
}
function X(e, t) {
	if (J(t) === "en") return Math.abs(e) === 1 ? "day" : "days";
	let n = Math.abs(e), r = n % 10, i = n % 100;
	return r === 1 && i !== 11 ? "день" : r >= 2 && r <= 4 && (i < 12 || i > 14) ? "дня" : "дней";
}
function Z(e, t) {
	return e === "overdue" ? Y(t, "overdue") : e === "due" ? Y(t, "due") : e === "warning" ? Y(t, "warning") : Y(t, "remaining");
}
function ye(e, t, n = !1) {
	let r = /* @__PURE__ */ new Date(`${e}T12:00:00`);
	return Number.isNaN(r.getTime()) ? e : new Intl.DateTimeFormat(t || "en", {
		weekday: "short",
		day: "numeric",
		month: "short",
		...n ? {
			hour: "2-digit",
			minute: "2-digit"
		} : {}
	}).format(r);
}
//#endregion
//#region src/localize/editor.ts
var be = {
	integrationNotLoaded: "Cyclic Maintenance Countdown is not loaded. Add it in Settings → Devices & services, then refresh this page.",
	changesSaved: "Changes saved",
	taskCreated: "Task created",
	saveFailed: "Could not save task",
	deleteConfirm: (e) => `Delete “${e}”? Existing cards will remain and show that the task is missing.`,
	taskDeleted: "Task deleted",
	deleteFailed: "Could not delete task",
	saveFirst: "Save the task first",
	testSent: (e, t) => `Test sent: ${e}; failed: ${t}`,
	testFailed: "Could not send test notification",
	loading: "Loading tasks…",
	retry: "Retry",
	task: "Task",
	selectedTask: "Selected task",
	createNewTask: "Create a new task",
	name: "Name",
	namePlaceholder: "For example, Water filter",
	icon: "Icon",
	intervalDays: "Interval, days",
	lastCompleted: "Last completed",
	today: "Today",
	warningWindow: "Warning window, days",
	nextDueDate: "Next due date",
	appearance: "Appearance",
	styleAria: "Card style",
	bar: "Bar",
	cardFill: "Card fill",
	reverseProgress: "Reverse progress direction",
	accentColor: "Accent color",
	themeColor: "Theme color",
	showSecondary: "Show secondary line",
	secondaryLine: "Secondary line",
	dueDate: "Due date",
	behavior: "Behavior",
	confirmCompletion: "Confirm completion",
	tap: "Tap",
	complete: "Complete",
	moreInfo: "More info",
	hold: "Hold",
	noAction: "No action",
	notifications: "Notifications",
	sendNotifications: "Send notifications",
	notificationTargets: "Notification targets",
	unavailable: " — unavailable",
	optionalTitle: "Optional title",
	onWarning: "On entering warning",
	onDue: "On due date",
	message: "Message",
	placeholders: "Placeholders",
	notification: "Notification",
	previewTaskName: "Water filter",
	sendTest: "Send test",
	deleteTask: "Delete task",
	saving: "Saving…",
	saveTask: "Save task",
	createTask: "Create task"
}, xe = {
	integrationNotLoaded: "Интеграция Cyclic Maintenance Countdown не загружена. Добавьте её в Настройки → Устройства и службы и обновите страницу.",
	changesSaved: "Изменения сохранены",
	taskCreated: "Задача создана",
	saveFailed: "Не удалось сохранить задачу",
	deleteConfirm: (e) => `Удалить задачу «${e}»? Карточки сохранятся и покажут, что задача не найдена.`,
	taskDeleted: "Задача удалена",
	deleteFailed: "Не удалось удалить задачу",
	saveFirst: "Сначала сохраните задачу",
	testSent: (e, t) => `Тест отправлен: ${e}; ошибок: ${t}`,
	testFailed: "Не удалось отправить тестовое уведомление",
	loading: "Загрузка задач…",
	retry: "Повторить",
	task: "Задача",
	selectedTask: "Выбранная задача",
	createNewTask: "Создать новую задачу",
	name: "Название",
	namePlaceholder: "Например, Бактерии",
	icon: "Иконка",
	intervalDays: "Период, дней",
	lastCompleted: "Последнее выполнение",
	today: "Сегодня",
	warningWindow: "Warning-период, дней",
	nextDueDate: "Следующий срок",
	appearance: "Внешний вид",
	styleAria: "Стиль карточки",
	bar: "Полоса",
	cardFill: "Заливка карточки",
	reverseProgress: "Обратное направление прогресса",
	accentColor: "Акцентный цвет",
	themeColor: "Цвет темы",
	showSecondary: "Показывать вторичную строку",
	secondaryLine: "Вторичная строка",
	dueDate: "Дата срока",
	behavior: "Поведение",
	confirmCompletion: "Подтверждать выполнение",
	tap: "Нажатие",
	complete: "Выполнить",
	moreInfo: "Подробнее",
	hold: "Удержание",
	noAction: "Нет действия",
	notifications: "Уведомления",
	sendNotifications: "Отправлять уведомления",
	notificationTargets: "Цели уведомлений",
	unavailable: " — недоступна",
	optionalTitle: "Заголовок, необязательно",
	onWarning: "При входе в warning",
	onDue: "В день срока",
	message: "Текст сообщения",
	placeholders: "Подстановки",
	notification: "Уведомление",
	previewTaskName: "Бактерии",
	sendTest: "Отправить тест",
	deleteTask: "Удалить задачу",
	saving: "Сохранение…",
	saveTask: "Сохранить задачу",
	createTask: "Создать задачу"
};
function Se(e) {
	return J(e) === "ru" ? xe : be;
}
//#endregion
//#region src/cyclic-countdown-editor.ts
var Ce = {
	type: "custom:cyclic-countdown-card",
	style: "bar",
	reverse_progress: !1,
	confirm_complete: !0,
	show_secondary: !0,
	secondary_info: "last_completed",
	tap_action: "complete",
	hold_action: "more-info"
}, Q = () => {
	let e = /* @__PURE__ */ new Date();
	return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
}, $ = () => ({
	name: "",
	icon: "mdi:wrench-clock",
	interval_days: 14,
	last_completed_date: Q(),
	due_date: "",
	warning_days: 1,
	notifications_enabled: !1,
	notification_targets: [],
	notification_title: "",
	notification_message: "{name}: {days} · {due_date}",
	notify_on_warning: !0,
	notify_on_due: !0,
	remaining_days: 14,
	elapsed_progress: 0,
	phase: "normal"
}), we = class extends q {
	constructor(...e) {
		super(...e), this._tasks = [], this._targets = [], this._draft = $(), this._previewPhase = "normal", this._loading = !0, this._saving = !1, this._error = "", this._notice = "", this._loadFailed = !1;
	}
	static {
		this.properties = {
			hass: { attribute: !1 },
			_config: { state: !0 },
			_tasks: { state: !0 },
			_targets: { state: !0 },
			_draft: { state: !0 },
			_previewPhase: { state: !0 },
			_loading: { state: !0 },
			_saving: { state: !0 },
			_error: { state: !0 },
			_notice: { state: !0 },
			_loadFailed: { state: !0 }
		};
	}
	get locale() {
		return this.hass?.locale?.language || this.hass?.language || navigator.language;
	}
	get s() {
		return Se(this.locale);
	}
	get visibleTargets() {
		let e = new Set(this._targets.map((e) => e.id)), t = this._draft.notification_targets.filter((t) => !e.has(t)).map((e) => ({
			id: e,
			name: e,
			available: !1,
			kind: "legacy_service"
		}));
		return [...this._targets, ...t];
	}
	get saveDisabled() {
		return this._saving || !this._draft.name.trim() || this._draft.interval_days < 1 || this._draft.warning_days < 0 || this._draft.warning_days > this._draft.interval_days || this._draft.notifications_enabled && !this._draft.notification_message.trim();
	}
	setConfig(e) {
		this._config = {
			...Ce,
			...e
		};
		let t = this._tasks.find((t) => t.task_id === e.task_id);
		t && (this._draft = {
			...t,
			notification_targets: [...t.notification_targets]
		});
	}
	updated(e) {
		e.has("hass") && this.hass && this._loadedConnection !== this.hass.connection && (this._loadedConnection = this.hass.connection, this.load());
	}
	async load() {
		if (this.hass) {
			this._loading = !0, this._loadFailed = !1, this._error = "";
			try {
				let [e, t] = await Promise.all([this.hass.connection.sendMessagePromise({ type: "cyclic_countdown/tasks/list" }), this.hass.connection.sendMessagePromise({ type: "cyclic_countdown/notification_targets/list" })]);
				this._tasks = e, this._targets = t;
				let n = e.find((e) => e.task_id === this._config?.task_id);
				n && (this._draft = {
					...n,
					notification_targets: [...n.notification_targets]
				});
			} catch {
				this._loadFailed = !0, this._error = this.s.integrationNotLoaded;
			} finally {
				this._loading = !1;
			}
		}
	}
	emitConfig(e) {
		if (!this._config) return;
		let t = {
			...this._config,
			...e
		};
		for (let [e, n] of Object.entries(t)) n === void 0 && delete t[e];
		this._config = t, this.dispatchEvent(new CustomEvent("config-changed", {
			bubbles: !0,
			composed: !0,
			detail: { config: this._config }
		}));
	}
	selectTask(e) {
		let t = e.target.value;
		if (t === "__new") {
			this._draft = $(), this.emitConfig({ task_id: void 0 });
			return;
		}
		let n = this._tasks.find((e) => e.task_id === t);
		n && (this._draft = {
			...n,
			notification_targets: [...n.notification_targets]
		}, this.emitConfig({ task_id: t }));
	}
	updateDraft(e, t) {
		this._draft = {
			...this._draft,
			[e]: t
		};
	}
	input(e, t) {
		this.updateDraft(e, t.target.value);
	}
	numberInput(e, t) {
		this.updateDraft(e, Number(t.target.value));
	}
	boolInput(e, t) {
		this.updateDraft(e, t.target.checked);
	}
	dueDate() {
		let e = /* @__PURE__ */ new Date(`${this.computedDueIso()}T12:00:00`);
		return Number.isNaN(e.getTime()) ? "—" : new Intl.DateTimeFormat(this.hass?.language || "ru", {
			weekday: "short",
			day: "numeric",
			month: "long",
			year: "numeric"
		}).format(e);
	}
	computedDueIso() {
		let e = /* @__PURE__ */ new Date(`${this._draft.last_completed_date}T12:00:00`);
		return Number.isNaN(e.getTime()) || this._draft.interval_days < 1 ? "—" : (e.setDate(e.getDate() + this._draft.interval_days), `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`);
	}
	payload() {
		let { name: e, icon: t, interval_days: n, last_completed_date: r, warning_days: i, notifications_enabled: a, notification_targets: o, notification_title: s, notification_message: c, notify_on_warning: l, notify_on_due: u } = this._draft;
		return {
			name: e,
			icon: t,
			interval_days: n,
			last_completed_date: r,
			warning_days: i,
			notifications_enabled: a,
			notification_targets: o,
			notification_title: s,
			notification_message: c,
			notify_on_warning: l,
			notify_on_due: u
		};
	}
	async saveTask() {
		if (!(!this.hass || this._saving)) {
			this._saving = !0, this._error = "", this._notice = "";
			try {
				let e = this._draft.task_id, t = await this.hass.connection.sendMessagePromise({
					type: e ? "cyclic_countdown/tasks/update" : "cyclic_countdown/tasks/create",
					...e ? { task_id: e } : {},
					...this.payload()
				}), n = this._tasks.filter((e) => e.task_id !== t.task_id);
				this._tasks = [...n, t].sort((e, t) => e.name.localeCompare(t.name)), this._draft = {
					...t,
					notification_targets: [...t.notification_targets]
				}, this.emitConfig({ task_id: t.task_id }), this._notice = e ? this.s.changesSaved : this.s.taskCreated;
			} catch (e) {
				this._error = e instanceof Error ? e.message : this.s.saveFailed;
			} finally {
				this._saving = !1;
			}
		}
	}
	async deleteTask() {
		if (!(!this.hass || !this._draft.task_id) && window.confirm(this.s.deleteConfirm(this._draft.name))) try {
			await this.hass.connection.sendMessagePromise({
				type: "cyclic_countdown/tasks/delete",
				task_id: this._draft.task_id
			}), this._tasks = this._tasks.filter((e) => e.task_id !== this._draft.task_id), this._draft = $(), this.emitConfig({ task_id: void 0 }), this._notice = this.s.taskDeleted;
		} catch {
			this._error = this.s.deleteFailed;
		}
	}
	targetChanged(e) {
		let t = [...e.target.selectedOptions];
		this.updateDraft("notification_targets", t.map((e) => e.value));
	}
	async testNotification() {
		if (!this.hass || !this._draft.task_id) {
			this._error = this.s.saveFirst;
			return;
		}
		this._error = "";
		try {
			let e = await this.hass.connection.sendMessagePromise({
				type: "cyclic_countdown/notifications/test",
				task_id: this._draft.task_id,
				targets: this._draft.notification_targets
			});
			this._notice = this.s.testSent(e.delivered.length, e.failed.length);
		} catch {
			this._error = this.s.testFailed;
		}
	}
	get previewTask() {
		let e = {
			normal: Math.max(this._draft.warning_days + 1, Math.ceil(this._draft.interval_days / 2)),
			warning: Math.max(1, this._draft.warning_days || 1),
			due: 0,
			overdue: -2
		}[this._previewPhase];
		return {
			...this._draft,
			task_id: this._draft.task_id || "preview",
			name: this._draft.name || this.s.previewTaskName,
			due_date: this.computedDueIso() === "—" ? Q() : this.computedDueIso(),
			remaining_days: e,
			elapsed_progress: Math.min(1, Math.max(0, (this._draft.interval_days - e) / this._draft.interval_days)),
			phase: this._previewPhase,
			notification_targets: [...this._draft.notification_targets]
		};
	}
	renderIconPicker() {
		return customElements.get("ha-icon-picker") ? I`<ha-icon-picker
        .hass=${this.hass}
        .value=${this._draft.icon}
        @value-changed=${(e) => this.updateDraft("icon", e.detail.value)}
      ></ha-icon-picker>` : I`<input value=${this._draft.icon} @input=${(e) => this.input("icon", e)} placeholder="mdi:wrench-clock" />`;
	}
	render() {
		return this._config ? this._loading ? I`<div class="status">${this.s.loading}</div>` : this._loadFailed ? I`<div class="integration-error">${this._error}<button @click=${this.load}>${this.s.retry}</button></div>` : I`
      ${this._error ? I`<div class="message error" role="alert">${this._error}</div>` : R}
      ${this._notice ? I`<div class="message notice" role="status">${this._notice}</div>` : R}

      <section>
        <h3><ha-icon icon="mdi:calendar-sync"></ha-icon>${this.s.task}</h3>
        <label>${this.s.selectedTask}
          <select @change=${this.selectTask} .value=${this._config.task_id || "__new"}>
            <option value="__new">＋ ${this.s.createNewTask}</option>
            ${this._tasks.map((e) => I`<option value=${e.task_id}>${e.name}</option>`)}
          </select>
        </label>
        <div class="grid">
          <label>${this.s.name}<input required maxlength="128" .value=${this._draft.name} @input=${(e) => this.input("name", e)} placeholder=${this.s.namePlaceholder} /></label>
          <label>${this.s.icon}${this.renderIconPicker()}</label>
          <label>${this.s.intervalDays}<input type="number" min="1" max="3650" .value=${String(this._draft.interval_days)} @input=${(e) => this.numberInput("interval_days", e)} /></label>
          <label>${this.s.lastCompleted}<span class="inline-field"><input type="date" .value=${this._draft.last_completed_date} @input=${(e) => this.input("last_completed_date", e)} /><button @click=${() => this.updateDraft("last_completed_date", Q())}>${this.s.today}</button></span></label>
          <label>${this.s.warningWindow}<input type="number" min="0" .max=${String(this._draft.interval_days)} .value=${String(this._draft.warning_days)} @input=${(e) => this.numberInput("warning_days", e)} /></label>
          <div class="due-preview"><span>${this.s.nextDueDate}</span><strong>${this.dueDate()}</strong></div>
        </div>
      </section>

      <section>
        <h3><ha-icon icon="mdi:palette-outline"></ha-icon>${this.s.appearance}</h3>
        <div class="style-picker" role="radiogroup" aria-label=${this.s.styleAria}>
          ${["bar", "fill"].map((e) => I`
            <button class="style-option ${this._config?.style === e ? "selected" : ""}" @click=${() => this.emitConfig({ style: e })}>
              <span class="mini ${e}"><i></i><b></b><em></em></span>${e === "bar" ? this.s.bar : this.s.cardFill}
            </button>`)}
        </div>
        <div class="grid">
          <label class="toggle"><input type="checkbox" .checked=${this._config.reverse_progress} @change=${(e) => this.emitConfig({ reverse_progress: e.target.checked })} /><span>${this.s.reverseProgress}</span></label>
          <label>${this.s.accentColor}<span class="inline-field"><input type="color" .value=${this._config.accent_color || "#6d78e8"} @input=${(e) => this.emitConfig({ accent_color: e.target.value })} /><button @click=${() => this.emitConfig({ accent_color: void 0 })}>${this.s.themeColor}</button></span></label>
          <label class="toggle"><input type="checkbox" .checked=${this._config.show_secondary} @change=${(e) => this.emitConfig({ show_secondary: e.target.checked })} /><span>${this.s.showSecondary}</span></label>
          <label>${this.s.secondaryLine}<select .value=${this._config.secondary_info} @change=${(e) => this.emitConfig({ secondary_info: e.target.value })}><option value="last_completed">${this.s.lastCompleted}</option><option value="due_date">${this.s.dueDate}</option></select></label>
        </div>
        <div class="preview-toolbar"><span>Live preview</span><select .value=${this._previewPhase} @change=${(e) => {
			this._previewPhase = e.target.value;
		}}><option value="normal">Normal</option><option value="warning">Warning</option><option value="due">Due</option><option value="overdue">Overdue</option></select></div>
        <cyclic-countdown-card .hass=${this.hass} .previewTask=${this.previewTask} ._config=${this._config}></cyclic-countdown-card>
      </section>

      <section>
        <h3><ha-icon icon="mdi:gesture-tap"></ha-icon>${this.s.behavior}</h3>
        <div class="grid">
          <label class="toggle"><input type="checkbox" .checked=${this._config.confirm_complete} @change=${(e) => this.emitConfig({ confirm_complete: e.target.checked })} /><span>${this.s.confirmCompletion}</span></label>
          <label>${this.s.tap}<select .value=${this._config.tap_action} @change=${(e) => this.emitConfig({ tap_action: e.target.value })}><option value="complete">${this.s.complete}</option><option value="more-info">${this.s.moreInfo}</option></select></label>
          <label>${this.s.hold}<select .value=${this._config.hold_action} @change=${(e) => this.emitConfig({ hold_action: e.target.value })}><option value="more-info">${this.s.moreInfo}</option><option value="none">${this.s.noAction}</option></select></label>
        </div>
      </section>

      <section>
        <h3><ha-icon icon="mdi:bell-outline"></ha-icon>${this.s.notifications}</h3>
        <label class="toggle"><input type="checkbox" .checked=${this._draft.notifications_enabled} @change=${(e) => this.boolInput("notifications_enabled", e)} /><span>${this.s.sendNotifications}</span></label>
        ${this._draft.notifications_enabled ? I`
          <label>${this.s.notificationTargets}<select multiple size="${Math.min(6, Math.max(3, this.visibleTargets.length))}" @change=${this.targetChanged}>${this.visibleTargets.map((e) => I`<option value=${e.id} ?selected=${this._draft.notification_targets.includes(e.id)}>${e.name}${e.available ? "" : this.s.unavailable}</option>`)}</select></label>
          <div class="grid">
            <label>${this.s.optionalTitle}<input .value=${this._draft.notification_title} @input=${(e) => this.input("notification_title", e)} /></label>
            <label class="toggle"><input type="checkbox" .checked=${this._draft.notify_on_warning} @change=${(e) => this.boolInput("notify_on_warning", e)} /><span>${this.s.onWarning}</span></label>
            <label class="toggle"><input type="checkbox" .checked=${this._draft.notify_on_due} @change=${(e) => this.boolInput("notify_on_due", e)} /><span>${this.s.onDue}</span></label>
          </div>
          <label>${this.s.message}<textarea required .value=${this._draft.notification_message} @input=${(e) => this.input("notification_message", e)}></textarea><small>${this.s.placeholders}: {name}, {days}, {due_date}</small></label>
          <div class="notification-preview"><span>${this._draft.notification_title || this.s.notification}</span><p>${this._draft.notification_message.replaceAll("{name}", this._draft.name || this.s.previewTaskName).replaceAll("{days}", String(this.previewTask.remaining_days)).replaceAll("{due_date}", this.computedDueIso() === "—" ? Q() : this.computedDueIso())}</p></div>
          <button class="ghost" @click=${this.testNotification}>${this.s.sendTest}</button>
        ` : R}
      </section>

      <footer>
        ${this._draft.task_id ? I`<button class="danger" @click=${this.deleteTask}>${this.s.deleteTask}</button>` : I`<span></span>`}
        <button class="save" ?disabled=${this.saveDisabled} @click=${this.saveTask}>${this._saving ? this.s.saving : this._draft.task_id ? this.s.saveTask : this.s.createTask}</button>
      </footer>
    ` : R;
	}
	static {
		this.styles = o`
    :host { display: block; color: var(--primary-text-color); font-family: var(--ha-font-family-body, inherit); }
    section { margin: 0 0 16px; padding: 16px; border: 1px solid var(--divider-color, rgba(127,127,127,.22)); border-radius: 18px; background: color-mix(in srgb, var(--secondary-background-color, transparent) 42%, transparent); }
    h3 { margin: 0 0 16px; display: flex; align-items: center; gap: 9px; font-size: 17px; }
    h3 ha-icon { color: var(--primary-color); --mdc-icon-size: 21px; }
    label { display: flex; flex-direction: column; gap: 7px; margin: 0 0 13px; color: var(--secondary-text-color); font-size: 12px; font-weight: 650; }
    input, select, textarea { box-sizing: border-box; width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid var(--divider-color, #888); border-radius: 12px; color: var(--primary-text-color); background: var(--card-background-color, #fff); font: inherit; font-size: 14px; }
    input:focus, select:focus, textarea:focus, button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
    input[type="color"] { padding: 5px; }
    input[type="checkbox"] { width: 20px; min-height: 20px; accent-color: var(--primary-color); }
    select[multiple] { min-height: 92px; }
    textarea { min-height: 88px; resize: vertical; }
    small { font-weight: 400; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; }
    .toggle { min-height: 44px; flex-direction: row; align-items: center; gap: 10px; color: var(--primary-text-color); font-size: 14px; }
    .inline-field { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
    .inline-field button { white-space: nowrap; font-size: 12px; }
    .due-preview { min-height: 44px; display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 0 12px; border-left: 3px solid var(--primary-color); }
    .due-preview span { color: var(--secondary-text-color); font-size: 11px; }
    .due-preview strong { font-size: 13px; }
    .style-picker { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
    button { min-height: 44px; border: 0; border-radius: 12px; padding: 9px 14px; font: inherit; font-weight: 650; cursor: pointer; color: var(--primary-text-color); background: var(--secondary-background-color, rgba(127,127,127,.12)); }
    button:disabled { opacity: .48; cursor: default; }
    .style-option { min-height: 88px; display: flex; flex-direction: column; gap: 8px; align-items: stretch; font-size: 12px; border: 2px solid transparent; }
    .style-option.selected { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 9%, var(--card-background-color)); }
    .mini { position: relative; height: 40px; overflow: hidden; border-radius: 12px; background: var(--card-background-color); border: 1px solid var(--divider-color); }
    .mini i { position: absolute; left: 6px; top: 6px; width: 28px; height: 28px; border-radius: 9px; background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
    .mini b { position: absolute; left: 42px; top: 10px; right: 28px; height: 6px; border-radius: 4px; background: var(--primary-text-color); opacity: .78; }
    .mini em { position: absolute; right: 7px; top: 8px; width: 16px; height: 14px; border-radius: 4px; background: var(--primary-text-color); opacity: .62; }
    .mini.bar::after { content: ""; position: absolute; left: 42px; bottom: 9px; right: 30px; height: 4px; border-radius: 4px; background: linear-gradient(90deg, var(--primary-color) 65%, var(--divider-color) 65%); }
    .mini.fill::after { content: ""; position: absolute; inset: 0 44% 0 0; background: color-mix(in srgb, var(--primary-color) 13%, transparent); }
    .preview-toolbar { margin: 4px 0 9px; display: flex; align-items: center; justify-content: space-between; color: var(--secondary-text-color); font-size: 12px; font-weight: 650; }
    .preview-toolbar select { width: auto; min-height: 36px; padding: 6px 10px; }
    cyclic-countdown-card { display: block; pointer-events: none; }
    .notification-preview { margin: 6px 0 12px; padding: 12px 14px; border-radius: 14px; background: var(--card-background-color); border: 1px solid var(--divider-color); }
    .notification-preview span { font-weight: 700; }
    .notification-preview p { margin: 5px 0 0; color: var(--secondary-text-color); font-size: 13px; }
    footer { position: sticky; bottom: 0; z-index: 5; display: flex; justify-content: space-between; gap: 12px; padding: 13px 0 4px; background: var(--card-background-color); }
    .save { background: var(--primary-color); color: var(--text-primary-color, #fff); }
    .danger { color: var(--error-color, #d85f58); }
    .ghost { border: 1px solid var(--divider-color); background: transparent; }
    .message, .integration-error, .status { margin-bottom: 14px; padding: 13px 15px; border-radius: 13px; font-size: 13px; }
    .message.error, .integration-error { background: color-mix(in srgb, var(--error-color, #d85f58) 14%, transparent); }
    .message.notice { background: color-mix(in srgb, var(--success-color, #43a66d) 14%, transparent); }
    @media (max-width: 520px) { .grid { grid-template-columns: 1fr; } .style-picker { grid-template-columns: 1fr; } footer { flex-wrap: wrap; } footer button { flex: 1; } }
  `;
	}
};
customElements.get("cyclic-countdown-editor") || customElements.define("cyclic-countdown-editor", we);
//#endregion
//#region src/cyclic-countdown-card.ts
var Te = {
	style: "bar",
	reverse_progress: !1,
	confirm_complete: !0,
	show_secondary: !0,
	secondary_info: "last_completed",
	tap_action: "complete",
	hold_action: "more-info"
}, Ee = {
	type: "custom:cyclic-countdown-card",
	...Te
}, De = class extends q {
	constructor(...e) {
		super(...e), this._config = { ...Ee }, this._confirmOpen = !1, this._busy = !1, this._error = "", this._justCompleted = !1, this._held = !1;
	}
	static {
		this.properties = {
			hass: { attribute: !1 },
			previewTask: { attribute: !1 },
			_config: { state: !0 },
			_optimisticTask: { state: !0 },
			_confirmOpen: { state: !0 },
			_busy: { state: !0 },
			_error: { state: !0 },
			_justCompleted: { state: !0 }
		};
	}
	static getConfigElement() {
		return document.createElement("cyclic-countdown-editor");
	}
	static getStubConfig() {
		return { ...Te };
	}
	setConfig(e) {
		if (!e) throw Error("Card configuration is required");
		this._config = {
			...Ee,
			...e,
			type: "custom:cyclic-countdown-card"
		};
	}
	getCardSize() {
		return 2;
	}
	getGridOptions() {
		return {
			rows: 2,
			columns: 6,
			min_rows: 2,
			min_columns: 3
		};
	}
	updated(e) {
		if (e.has("_confirmOpen") && this._confirmOpen) {
			let e = this.renderRoot.querySelector("dialog");
			e && !e.open && e.showModal();
		}
	}
	get locale() {
		return this.hass?.locale?.language || this.hass?.language || navigator.language;
	}
	get entity() {
		if (!(!this.hass || !this._config.task_id)) return Object.values(this.hass.states).find((e) => e.entity_id.startsWith("sensor.") && e.attributes.task_id === this._config.task_id);
	}
	get task() {
		if (this.previewTask) return this.previewTask;
		if (this._optimisticTask) return this._optimisticTask;
		let e = this.entity?.attributes;
		if (e?.task_id) return e;
	}
	get progress() {
		let e = this.task;
		if (!e) return 0;
		let t = this._config.reverse_progress ? 1 - e.elapsed_progress : e.elapsed_progress;
		return Math.round(Math.min(1, Math.max(0, t)) * 100);
	}
	secondary(e) {
		let t = this._config.secondary_info === "due_date";
		return `${t ? Y(this.locale, "dueDate") : Y(this.locale, "lastCompleted")}: ${ye(t ? e.due_date : e.last_completed_date, this.locale)}`;
	}
	buildAriaLabel(e) {
		return `${e.name}, ${Z(e.phase, this.locale)}, ${e.remaining_days} ${X(e.remaining_days, this.locale)}. ${this._config.tap_action === "complete" ? Y(this.locale, "complete") : ""}`;
	}
	pointerDown() {
		this._held = !1, this._config.hold_action !== "none" && (this._holdTimer = window.setTimeout(() => {
			this._held = !0, this.moreInfo();
		}, 550));
	}
	pointerUp() {
		this._holdTimer && window.clearTimeout(this._holdTimer);
	}
	activate() {
		if (this._held || this._busy || this.previewTask) {
			this._held = !1;
			return;
		}
		this._config.tap_action === "more-info" ? this.moreInfo() : this._config.confirm_complete ? this._confirmOpen = !0 : this.complete();
	}
	keyActivate(e) {
		(e.key === "Enter" || e.key === " ") && (e.preventDefault(), this.activate());
	}
	moreInfo() {
		let e = this.entity?.entity_id;
		e && this.dispatchEvent(new CustomEvent("hass-more-info", {
			bubbles: !0,
			composed: !0,
			detail: { entityId: e }
		}));
	}
	closeConfirm() {
		let e = this.renderRoot.querySelector("dialog");
		e?.open && typeof e.close == "function" && e.close(), this._confirmOpen = !1;
	}
	async complete() {
		let e = this.task;
		if (!e || !this.hass || !this._config.task_id || this._busy) return;
		this.closeConfirm(), this._busy = !0, this._error = "";
		let t = this._optimisticTask, n = /* @__PURE__ */ new Date(), r = new Date(n.getFullYear(), n.getMonth(), n.getDate() + e.interval_days), i = (e) => `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
		this._optimisticTask = {
			...e,
			last_completed_date: i(n),
			due_date: i(r),
			remaining_days: e.interval_days,
			elapsed_progress: 0,
			phase: "normal"
		};
		try {
			this._optimisticTask = await this.hass.connection.sendMessagePromise({
				type: "cyclic_countdown/tasks/complete",
				task_id: this._config.task_id
			}), this._justCompleted = !0, window.setTimeout(() => {
				this._justCompleted = !1, this._optimisticTask = void 0;
			}, 1800);
		} catch {
			this._optimisticTask = t, this._error = Y(this.locale, "backendError");
		} finally {
			this._busy = !1;
		}
	}
	configure(e) {
		e.stopPropagation(), this.dispatchEvent(new CustomEvent("ll-edit-card", {
			bubbles: !0,
			composed: !0
		}));
	}
	render() {
		let e = this.task;
		if (!e) return I`<ha-card class="missing">
        <ha-icon icon="mdi:wrench-clock"></ha-icon>
        <div><strong>${Y(this.locale, "notFound")}</strong><small>cyclic_countdown</small></div>
        <button @click=${this.configure}>${Y(this.locale, "configure")}</button>
      </ha-card>`;
		let t = `--progress:${this.progress}%;--accent:${this._config.accent_color || "var(--primary-color, #6d78e8)"}`;
		return I`
      <ha-card
        class="card ${this._config.style} ${e.phase} ${this._justCompleted ? "just-completed" : ""}"
        style=${t}
        role="button"
        tabindex="0"
        aria-label=${this.buildAriaLabel(e)}
        aria-busy=${this._busy ? "true" : "false"}
        @pointerdown=${this.pointerDown}
        @pointerup=${this.pointerUp}
        @pointercancel=${this.pointerUp}
        @click=${this.activate}
        @keydown=${this.keyActivate}
      >
        <div class="fill-layer" aria-hidden="true"></div>
        <div class="state-layer" aria-hidden="true"></div>
        <div class="content">
          <div class="icon-tile"><ha-icon .icon=${e.icon}></ha-icon></div>
          <div class="details">
            <div class="title-row">
              <div class="title">${e.name}</div>
              <span class="phase-label">${Z(e.phase, this.locale)}</span>
            </div>
            ${this._config.show_secondary ? I`<div class="secondary">${this.secondary(e)}</div>` : R}
            ${this._config.style === "bar" ? I`<div class="track"><div class="bar-progress"></div></div>` : R}
          </div>
          <div class="days">
            <strong>${e.remaining_days}</strong>
            <span>${X(e.remaining_days, this.locale)}</span>
          </div>
        </div>
        ${this._error ? I`<div class="error" role="alert">${this._error}</div>` : R}
      </ha-card>
      <dialog @cancel=${this.closeConfirm} @click=${(e) => {
			e.target === e.currentTarget && this.closeConfirm();
		}}>
        <div class="dialog-body">
          <h2>${Y(this.locale, "confirmTitle")}</h2>
          <p>${e.name} · ${this.secondary(e)}</p>
          <div class="dialog-actions">
            <button class="secondary-button" @click=${this.closeConfirm}>${Y(this.locale, "cancel")}</button>
            <button class="primary-button" @click=${this.complete}>${Y(this.locale, "complete")}</button>
          </div>
        </div>
      </dialog>
    `;
	}
	static {
		this.styles = o`
    :host {
      display: block;
      width: 100%;
      font-family: var(--ha-font-family-body, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      --danger: var(--cyclic-countdown-danger-color, var(--error-color, #e46f68));
      --warn: var(--cyclic-countdown-warning-color, var(--warning-color, #e5a83b));
    }
    ha-card { box-sizing: border-box; color: var(--primary-text-color); }
    .card {
      display: block; width: 100%; position: relative; min-height: 112px; overflow: hidden; cursor: pointer; isolation: isolate; touch-action: manipulation;
      border-radius: var(--cyclic-countdown-radius, max(var(--ha-card-border-radius, 24px), 24px));
      background: var(--cyclic-countdown-background, var(--ha-card-background, var(--card-background-color, #fff)));
      border: var(--cyclic-countdown-border, var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, rgba(127,127,127,.18)));
      box-shadow: var(--cyclic-countdown-shadow, var(--ha-card-box-shadow, 0 3px 14px rgba(0,0,0,.08)));
      -webkit-backdrop-filter: var(--cyclic-countdown-backdrop-filter, var(--ha-card-backdrop-filter, none));
      backdrop-filter: var(--cyclic-countdown-backdrop-filter, var(--ha-card-backdrop-filter, none));
      transition: transform 180ms ease, box-shadow 180ms ease;
    }
    .card:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 70%, white); outline-offset: 3px; }
    .card:active { transform: scale(.995); }
    .bar { --cyclic-countdown-radius: max(var(--ha-card-border-radius, 30px), 30px); }
    .fill { --cyclic-countdown-radius: max(var(--ha-card-border-radius, 24px), 24px); }
    .content { position: relative; z-index: 2; min-height: 112px; padding: 12px 16px; display: grid; grid-template-columns: 70px minmax(0,1fr) 82px; gap: 16px; align-items: center; box-sizing: border-box; }
    .icon-tile { position: relative; z-index: 3; width: 70px; height: 70px; display: grid; place-items: center; border-radius: 22px; background: var(--cyclic-countdown-icon-background, color-mix(in srgb, var(--accent) 13%, var(--secondary-background-color, var(--primary-background-color, #20242c)))); border: var(--cyclic-countdown-icon-border, 1px solid color-mix(in srgb, var(--accent) 10%, var(--divider-color, transparent))); box-shadow: var(--cyclic-countdown-icon-shadow, 0 5px 14px color-mix(in srgb, black 7%, transparent), inset 0 1px 0 color-mix(in srgb, white 8%, transparent)); -webkit-backdrop-filter: var(--cyclic-countdown-icon-backdrop-filter, none); backdrop-filter: var(--cyclic-countdown-icon-backdrop-filter, none); color: var(--accent); }
    .icon-tile ha-icon { position: relative; z-index: 1; --mdc-icon-size: 34px; }
    .details { min-width: 0; align-self: stretch; display: flex; flex-direction: column; justify-content: center; }
    .title-row { display: flex; align-items: baseline; gap: 9px; min-width: 0; }
    .title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 21px; line-height: 1.22; font-weight: 650; letter-spacing: -.018em; }
    .phase-label { flex: none; font-size: 12px; font-weight: 550; letter-spacing: 0; color: var(--secondary-text-color); }
    .normal .phase-label { display: none; }
    .secondary { margin-top: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--secondary-text-color); font-size: 14px; line-height: 1.3; }
    .days { min-width: 0; text-align: center; display: flex; flex-direction: column; align-items: center; line-height: 1; }
    .days strong { font-size: clamp(40px, 8vw, 52px); font-weight: 700; letter-spacing: -.05em; font-variant-numeric: tabular-nums; }
    .days span { max-width: 100%; margin-top: 3px; overflow: hidden; letter-spacing: .015em; font-size: 11px; font-weight: 500; color: var(--secondary-text-color); }
    .track { height: 6px; margin-top: 13px; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--divider-color, #888) 28%, transparent); }
    .bar-progress { width: var(--progress); height: 100%; border-radius: inherit; background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 78%, #9c6fe8), color-mix(in srgb, var(--accent) 68%, #f2c45d)); transition: width .45s cubic-bezier(.2,.8,.2,1); }
    .fill-layer, .state-layer { position: absolute; inset: 0; pointer-events: none; }
    .fill-layer { z-index: 0; width: var(--progress); right: auto; background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 14%, transparent), color-mix(in srgb, var(--accent) 7%, transparent)); transition: width .45s cubic-bezier(.2,.8,.2,1); }
    .fill-layer::after { content: ""; position: absolute; inset: 0 0 0 auto; width: 1px; background: color-mix(in srgb, var(--accent) 18%, transparent); opacity: clamp(0, var(--progress), 1); }
    .bar .fill-layer { display: none; }
    .state-layer { z-index: 1; opacity: 0; }
    .warning .state-layer { background: radial-gradient(circle at 90% 50%, color-mix(in srgb, var(--warn) 24%, transparent), transparent 67%); animation: warning-breathe 3.2s ease-in-out infinite; }
    .due .state-layer, .overdue .state-layer { background: radial-gradient(circle at 88% 50%, color-mix(in srgb, var(--danger) 27%, transparent), transparent 68%); animation: danger-breathe 2.9s ease-in-out infinite; }
    .warning .phase-label { color: var(--warn); }
    .due .phase-label, .overdue .phase-label, .overdue .days strong { color: var(--danger); }
    .just-completed .state-layer { background: color-mix(in srgb, var(--success-color, #43a66d) 18%, transparent); animation: success-flash 1.7s ease-out; }
    .error { position: relative; z-index: 4; padding: 7px 14px; background: color-mix(in srgb, var(--danger) 16%, var(--card-background-color)); color: var(--primary-text-color); font-size: 12px; }
    .missing { min-height: 96px; padding: 18px; display: grid; grid-template-columns: 44px 1fr auto; gap: 14px; align-items: center; border-radius: var(--ha-card-border-radius, 20px); }
    .missing div { display: flex; flex-direction: column; gap: 4px; }
    .missing small { color: var(--secondary-text-color); }
    button { min-height: 44px; border: 0; border-radius: 13px; padding: 0 16px; font: inherit; font-weight: 650; cursor: pointer; color: var(--primary-text-color); background: var(--secondary-background-color, rgba(127,127,127,.12)); }
    dialog { width: min(420px, calc(100vw - 32px)); padding: 0; border: 1px solid var(--divider-color); border-radius: 22px; color: var(--primary-text-color); background: var(--card-background-color, #fff); box-shadow: 0 20px 60px rgba(0,0,0,.28); }
    dialog::backdrop { background: rgba(0,0,0,.42); backdrop-filter: blur(3px); }
    .dialog-body { padding: 24px; }
    h2 { margin: 0 0 9px; font-size: 21px; }
    p { margin: 0; color: var(--secondary-text-color); }
    .dialog-actions { margin-top: 24px; display: flex; justify-content: flex-end; gap: 10px; }
    .primary-button { background: var(--primary-color); color: var(--text-primary-color, white); }
    @keyframes warning-breathe { 0%,100% { opacity: .38; transform: scale(1); } 50% { opacity: .9; transform: scale(1.006); } }
    @keyframes danger-breathe { 0%,100% { opacity: .42; transform: scale(1); } 50% { opacity: .95; transform: scale(1.009); } }
    @keyframes success-flash { 0% { opacity: .9; } 100% { opacity: 0; } }
    @media (max-width: 420px) {
      .content { padding: 13px 14px; grid-template-columns: 58px minmax(0,1fr) 66px; gap: 11px; }
      .icon-tile { width: 58px; height: 58px; border-radius: 18px; }
      .icon-tile ha-icon { --mdc-icon-size: 30px; }
      .title { font-size: 18px; }
      .secondary { font-size: 12px; }
      .phase-label { display: none; }
      .days strong { font-size: 38px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition-duration: .01ms !important; }
      .warning .state-layer { opacity: .62; }
      .due .state-layer, .overdue .state-layer { opacity: .68; }
    }
  `;
	}
};
customElements.get("cyclic-countdown-card") || customElements.define("cyclic-countdown-card", De), window.customCards = window.customCards || [], window.customCards.some((e) => e.type === "cyclic-countdown-card") || window.customCards.push({
	type: "cyclic-countdown-card",
	name: "Cyclic Maintenance Countdown",
	description: "A theme-aware calendar-day maintenance countdown",
	preview: !1,
	documentationURL: "https://github.com/PnnnG/Cyclic-Maintenance-Countdown"
});
//#endregion
export { De as CyclicCountdownCard };

//# sourceMappingURL=cyclic-countdown-card.js.map