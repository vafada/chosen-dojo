define(["dojo/_base/declare",
		"dojo/_base/lang",
		"dojo/_base/window",
		"dojo/_base/array",
		"dojo/dom-class",
		"dojo/dom-attr",
		"dojo/dom-geometry",
		"dojo/dom-construct",
		"dojo/dom-style",
		"dojo/on",
		"dojo/mouse",
		"dojo/dom",
		"dojo/topic",
		"dojo/keys",
		"dojo/has",
		"dojo/query",
		"./SelectParser",
		"dojo/NodeList-traverse"], function(declare, lang, win, array, domClass, domAttr, domGeom, domConstruct, domStyle, on, mouse, dom, topic, keys, has, query, SelectParser) {

	'use strict';

	var Chosen = declare([], {

		// TODO Reduce DOM interactions
		// TODO use domConstruct rather than HTML strings
		// TODO Use event delegation
		// TODO Copy format of other components
		// TODO Store a reference to key DOM elements early
		// TODO Make it all work on IE
		// TODO Switch to Less

		constructor: function(element, options) {
			this.document_click_handle = null;
			this.form_field = element;
			this.mouse_on_container = false;
			this.is_multiple = this.form_field.multiple;
			this.is_rtl = domClass.contains(this.form_field, 'chzn-rtl');
			this.active_field = false;
			this.choices = 0;
			this.result_single_selected = null;
			this.options = options != null ? options : {};
			this.results_none_found = domAttr.get(this.form_field, 'data-no_results_text') || this.options.no_results_text || "No results match";
			this.set_up_html();
			this.register_observers();
			domClass.add(this.form_field, 'chzn-done');
		},

		set_up_html: function() {
			if(!domAttr.get(this.form_field, 'id')) {
				domAttr.set(this.form_field, 'id', this.generate_random_id());
			}

			this.container_id = this.form_field.id.replace(/(:|\.)/g, '_') + "_chzn";

			this.f_width = domGeom.position(this.form_field).w;

			this.default_text = domAttr.get(this.form_field, 'data-placeholder') ? domAttr.get(this.form_field, 'data-placeholder') : "Select Some Options";

			this.container = domConstruct.create('div', {
				id: this.container_id,
				className: 'chzn-container' + (this.is_rtl ? ' chzn-rtl' : '') + " chzn-container-" + (this.is_multiple ? "multi" : "single"),
				style: 'width: ' + this.f_width + 'px'
			});

			if(this.is_multiple) {
				this.container.innerHTML = '<ul class="chzn-choices"><li class="search-field"><input type="text" value="' + this.default_text + '" class="default" autocomplete="off" style="width:25px;" /></li></ul><div class="chzn-drop" style="left:-9000px;"><ul class="chzn-results"></ul></div>';
			} else {
				this.container.innerHTML = '<a href="javascript:void(0)" class="chzn-single"><span>' + this.default_text + '</span><div><b></b></div></a><div class="chzn-drop" style="left:-9000px;"><div class="chzn-search"><input type="text" autocomplete="off" /></div><ul class="chzn-results"></ul></div>';
			}

			domStyle.set(this.form_field, 'display', 'none');
			domConstruct.place(this.container, this.form_field, 'after');

			this.dropdown = query('div.chzn-drop', this.container).shift();

			var dd_top = domGeom.position(this.container, false).h;

			var dd_width = this.f_width - (domGeom.position(this.dropdown).w - domGeom.getContentBox(this.dropdown).w);
			domStyle.set(this.dropdown, {
				'width': dd_width + "px",
				'top': dd_top + "px"
			});

			this.search_field = query('input', this.container).shift();
			this.search_results = query('ul.chzn-results', this.container).shift();
			this.search_field_scale();

			if(this.is_multiple) {
				this.search_choices = query('ul.chzn-choices', this.container).shift();
				this.search_container = query('li.search-field', this.container).shift();
			} else {
				this.search_container = query('div.chzn-search', this.container).shift();
				this.selected_item = query('.chzn-single', this.container).shift();

				var sf_width = dd_width - (domGeom.position(this.search_container).w - domGeom.getContentBox(this.search_container).w) - (domGeom.position(this.search_field).w -  domGeom.getContentBox(this.search_field).w);
				domStyle.set(this.search_field, 'width', sf_width + 'px');
			}

			this.results_build();
			this.set_tab_index();
		},

		register_observers: function() {
			on(this.container, 'mousedown', lang.hitch(this, this.container_mousedown));
			on(this.container, 'mouseup', lang.hitch(this, this.container_mouseup));
			on(this.container, mouse.enter, lang.hitch(this, this.mouse_enter));
			on(this.container, mouse.leave, lang.hitch(this, this.mouse_leave));

			on(this.search_results, 'mouseover', lang.hitch(this, this.search_results_mouseover));
			on(this.search_results, 'mouseup', lang.hitch(this, this.search_results_mouseup));
			on(this.search_results, 'mouseout', lang.hitch(this, this.search_results_mouseout));

			topic.subscribe('liszt:updated', lang.hitch(this, this.results_update_field));

			on(this.search_field, 'blur', lang.hitch(this, this.input_blur));
			on(this.search_field, 'keyup', lang.hitch(this, this.keyup_checker));
			on(this.search_field, 'keydown', lang.hitch(this, this.keydown_checker));

			if(this.is_multiple) {
				on(this.search_choices, 'click', lang.hitch(this, this.choices_click));
				on(this.search_field, 'focus', lang.hitch(this, this.input_focus));
			} else {
				on(this.selected_item, 'focus', lang.hitch(this, this.activate_field));
			}
		},

		results_update_field: function(select_object) {
			if(select_object[0] !== this.form_field) {
				return;
			}

			if(!this.is_multiple) {
				this.results_reset_cleanup();
			} else if(this.is_multiple && this.choices > 0) {
				query("li.search-choice", this.search_choices).forEach(domConstruct.destroy);
				this.choices = 0;
			}

			this.result_clear_highlight();
			this.result_single_selected = null;
			return this.results_build();
		},

		input_blur: function() {
			var _this = this;
			if(!this.mouse_on_container) {
				this.active_field = false;
				return setTimeout((function() {
					_this.blur_test();
				}), 100);
			}
		},

		results_reset_cleanup: function() {
			domConstruct.destroy(query('abbr', this.selected_item).shift());
		},

		blur_test: function() {
			if(!this.active_field && domClass.contains(this.container, 'chzn-container-active')) {
				this.close_field();
			}
		},

		container_mouseup: function(evt) {
			if(evt.target.nodeName === "ABBR" && !this.is_disabled) {
				this.results_reset(evt);
			}
		},

		mouse_enter: function() {
			this.mouse_on_container = true;
		},

		mouse_leave: function() {
			this.mouse_on_container = false;
		},

		keyup_checker: function(evt) {
			this.search_field_scale();

			switch(evt.keyCode) {
				case keys.BACKSPACE:
					if(this.is_multiple && this.backstroke_length < 1 && this.choices > 0) {
						this.keydown_backstroke();
					} else if(!this.pending_backstroke) {
						this.result_clear_highlight();
						this.results_search();
					}
					break;

				case keys.ENTER:
					evt.preventDefault();
					if(this.results_showing) {
						this.result_select(evt);
					}
					break;
				case keys.ESCAPE:
					if(this.results_showing) {
						this.results_hide();
					}
					break;
				case keys.TAB:
				case keys.UP_ARROW:
				case keys.DOWN_ARROW:
				case keys.SHIFT:
				case keys.CTRL:
					break;

				default:
					this.results_search();
			}
		},

		keydown_checker: function(evt) {
			this.search_field_scale();

			if(evt.keyCode !== keys.BACKSPACE && this.pending_backstroke) {
				this.clear_backstroke();
			}

			switch(evt.keyCode) {
				case keys.BACKSPACE:
					this.backstroke_length = this.search_field.value.length;
					break;

				case keys.TAB:
					if(this.results_showing && !this.is_multiple) {
						this.result_select(evt);
					}
					this.mouse_on_container = false;
					break;

				case keys.ENTER:
					evt.preventDefault();
					break;

				case keys.UP_ARROW:
					evt.preventDefault();
					this.keyup_arrow();
					break;

				case keys.DOWN_ARROW:
					this.keydown_arrow();
					break;
			}
		},

		keydown_arrow: function() {
			if(!this.result_highlight) {
				var first_active = query("li.active-result", this.search_results).shift();
				if(first_active) {
					this.result_do_highlight(first_active);
				}
			} else if(this.results_showing) {
				var next_sib = query(this.result_highlight).nextAll("li.active-result")[0];

				if(next_sib) {
					this.result_do_highlight(next_sib);
				}
			}

			if(!this.results_showing) {
				this.results_show();
			}
		},

		keyup_arrow: function() {
			if(!this.results_showing && !this.is_multiple) {
				this.results_show();
			} else if(this.result_highlight) {
				var prev_sib = query(this.result_highlight).prevAll("li.active-result")[0];

				if(prev_sib) {
					this.result_do_highlight(prev_sib);
				} else {
					if(this.choices > 0) {
						this.results_hide();
					}
					this.result_clear_highlight();
				}
			}
		},

		results_search: function() {
			if(this.results_showing) {
				this.winnow_results();
			} else {
				this.results_show();
			}
		},

		results_reset: function(evt) {
			this.form_field.options[0].selected = true;
			query('span', this.selected_item).shift().textContent = this.default_text;
			this.show_search_field_default();
			domConstruct.destroy(evt.target);
			this.dojo_fire_event("change");
			if(this.active_field) {
				this.results_hide();
			}
		},

		choices_click: function(evt) {
			evt.preventDefault();

			if(this.active_field && !(domClass.contains(query(evt.target).shift(), 'search-choice') || (query(evt.target).parent('.search-choice').length > 0)) && !this.results_showing) {
				this.results_show();
			}
		},

		search_results_mouseout: function(evt) {
			if(domClass.contains(query(evt.target).shift(), 'active-result') || query(evt.target).parent('.active-result')) {
				this.result_clear_highlight();
			}
		},

		search_results_mouseup: function(evt) {
			var target = domClass.contains(query(evt.target).shift(), 'active-result') ? evt.target : query(evt.target).parent('.active-result').shift();

			if(target) {
				this.result_highlight = target;
				this.result_select(evt);
			}
		},

		clear_backstroke: function() {
			if(this.pending_backstroke) {
				domClass.remove(this.pending_backstroke, "search-choice-focus");
			}
			this.pending_backstroke = null;
		},

		result_select: function(evt) {
			if(this.result_highlight) {
				var high = this.result_highlight, high_id = high.id;
				this.result_clear_highlight();

				var position = high_id.substr(high_id.lastIndexOf("_") + 1);

				var item = this.results_data[position];

				if(this.is_multiple && item.group && this.options.batch_select) {
					// assume multiple
					var siblings = query(high).nextAll();

					var index = 0;

					while(siblings[index] && !domClass.contains(siblings[index], "group-result-selectable")) {
						if(domClass.contains(siblings[index], "active-result")) {
							var sibling = siblings[index];
							var sibling_id = sibling.id;
							var sibling_position = sibling_id.substr(sibling_id.lastIndexOf("_") + 1);
							var sibling_item = this.results_data[sibling_position];
							sibling_item.selected = true;
							this.form_field.options[sibling_item.options_index].selected = true;

							this.result_deactivate(sibling);

							domClass.add(sibling, "result-selected");

							this.choice_build(sibling_item);
						}

						index++;
					}
				} else {
					if(this.is_multiple) {
						this.result_deactivate(high);
					} else {
						var selected = query(this.search_results, '.result-selected').shift();

						if(selected) {
							domClass.remove(selected, "result-selected");
						}
						this.result_single_selected = high;
					}

					domClass.add(high, "result-selected");

					item.selected = true;
					this.form_field.options[item.options_index].selected = true;

					if(this.is_multiple) {
						this.choice_build(item);
					} else {
						query('span', this.selected_item).shift().textContent = item.text;
						if(this.options.allow_single_deselect) {
							this.single_deselect_control_build();
						}
					}
				}

				if(!((evt.metaKey || evt.ctrlKey) && this.is_multiple)) {
					this.results_hide();
				}
				domAttr.set(this.search_field, 'value', "");
				this.dojo_fire_event("change");

				this.search_field_scale();
			}
		},

		// TODO Replace with emit ?
		dojo_fire_event: function(event_name) {
			// IE does things differently
			if(has('ie-event-behavior')) {
				query(this.form_field).shift().fireEvent("on" + event_name);
			} else {  // Not IE
				var event = document.createEvent("HTMLEvents");
				event.initEvent(event_name, false, true);
				query(this.form_field).shift().dispatchEvent(event);
			}
		},

		single_deselect_control_build: function() {
			if(this.options.allow_single_deselect && query('abbr', this.selected_item).length < 1) {
				domConstruct.create('abbr', {className: 'search-choice-close'}, query('span', this.selected_item).shift());
			}
		},

		input_focus: function() {
			var _this = this;
			if(!this.active_field) {
				return setTimeout((function() {
					return _this.container_mousedown();
				}), 50);
			}
		},

		container_mousedown: function(evt) {
			if(!this.is_disabled) {
				var target_closelink = evt != null ? domClass.contains(evt.target, 'search-choice-close') : false;
				if(evt && evt.type === "mousedown") {
					evt.stopPropagation();
				}

				if(!this.pending_destroy_click && !target_closelink) {
					if(!this.active_field) {
						if(this.is_multiple) {
							domAttr.set(this.search_field, 'value', '');
						}

						this.document_click_handle = on(document, 'click', lang.hitch(this, this.test_active_click));

						this.results_show();
					} else if(!this.is_multiple && evt && (evt.target === this.selected_item || query(evt.target).parents('a.chzn-single').length)) {
						evt.preventDefault();
						this.results_toggle();
					}
					this.activate_field();
				} else {
					this.pending_destroy_click = false;
				}
			}

		},

		results_toggle: function() {
			if(this.results_showing) {
				this.results_hide();
			} else {
				this.results_show();
			}
		},

		results_hide: function() {
			if(!this.is_multiple) {
				domClass.remove(this.selected_item, "chzn-single-with-drop");
			}

			this.result_clear_highlight();
			domStyle.set(this.dropdown, 'left', '-9000px');
			this.results_showing = false;
		},

		search_results_mouseover: function(evt) {

			var target = domClass.contains(query(evt.target).shift(), "active-result") ? evt.target : query(evt.target).parent(".active-result").shift();

			if(target) {
				this.result_do_highlight(target);
			}
		},

		results_show: function() {

			if(!this.is_multiple) {
				domClass.add(this.selected_item, 'chzn-single-with-drop');
				if(this.result_single_selected) {
					this.result_do_highlight(this.result_single_selected);
				}
			}

			var dd_top = this.is_multiple ? domGeom.position(this.container).h : domGeom.position(this.container).h - 1;

			domStyle.set(this.dropdown, {
				top: dd_top + 'px',
				left: '0px'
			});


			this.results_showing = true;
			this.search_field.focus();
			domAttr.set(this.search_field, 'value', domAttr.get(this.search_field, 'value'));
			this.winnow_results();
		},

		winnow_results: function() {
			this.no_results_clear();

			var results = 0,
				searchText = domAttr.get(this.search_field, 'value') === this.default_text ? "" : lang.trim(domAttr.get(this.search_field, 'value')),
				regex = new RegExp('^' + searchText.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"), 'i'),
				zregex = new RegExp(searchText.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"), 'i');

			var _this = this;

			array.forEach(this.results_data, function(option) {
				if(!option.disabled && !option.empty) {
					if(option.group) {
						domStyle.set(dom.byId(option.dom_id), 'display', 'none');
					} else if(!(_this.is_multiple && option.selected)) {
						var found = false,
							result_id = option.dom_id,
							result = dom.byId(result_id);
						if(regex.test(option.html)) {
							found = true;
							results += 1;
						} else if(option.html.indexOf(" ") >= 0 || option.html.indexOf("[") === 0) {
							var parts = option.html.replace(/\[|\]/g, "").split(" ");

							if(parts.length) {
								array.forEach(parts, function(part) {
									if(regex.test(part)) {
										found = true;
										results += 1;
									}
								});
							}
						}

						if(found) {
							var text;
							if(searchText.length) {
								var startpos = option.html.search(zregex);
								text = option.html.substr(0, startpos + searchText.length) + '</em>' + option.html.substr(startpos + searchText.length);
								text = text.substr(0, startpos) + '<em>' + text.substr(startpos);
							} else {
								text = option.html;
							}

							result.innerHTML = text;
							_this.result_activate(result);

							if(option.group_array_index != null) {
								domStyle.set(dom.byId(_this.results_data[option.group_array_index].dom_id), 'display', 'list-item');
							}

						} else {
							if(_this.result_highlight && result_id === _this.result_highlight.id) {
								_this.result_clear_highlight();
							}

							_this.result_deactivate(result);
						}
					}
				}
			});

			if(results < 1 && searchText.length) {
				this.no_results(searchText);
			} else {
				this.winnow_results_set_highlight();
			}
		},

		no_results: function(terms) {
			var no_results_html = domConstruct.create('li', {className: 'no-results', innerHTML: this.results_none_found + ' "<span></span>" '}, this.search_results);
			query('span', no_results_html).shift().textContent = terms;
		},

		winnow_results_set_highlight: function() {
			if(!this.result_highlight) {
				var selected_results = !this.is_multiple ? query(".result-selected", this.search_results) : [];
				var do_high = selected_results.length ? selected_results[0] : query(".active-result", this.search_results).shift();
				if(do_high != null) {
					this.result_do_highlight(do_high);
				}
			}
		},

		result_do_highlight: function(el) {
			if(el) {
				this.result_clear_highlight();
				this.result_highlight = el;
				domClass.add(this.result_highlight, "highlighted");
				var maxHeight = parseInt(domStyle.get(this.search_results, "maxHeight"), 10);


				var visible_top = this.search_results.scrollTop,
					visible_bottom = maxHeight + visible_top,
					high_top = (domGeom.position(this.result_highlight).y - domGeom.position(this.search_results).y) + this.search_results.scrollTop,
					high_bottom = high_top + domGeom.position(this.result_highlight).h;


				if(high_bottom >= visible_bottom) {
					this.search_results.scrollTop = (high_bottom - maxHeight) > 0 ? high_bottom - maxHeight : 0;
				} else if(high_top < visible_top) {
					this.search_results.scrollTop = high_top;
				}

			}
		},

		result_clear_highlight: function() {
			if(this.result_highlight) {
				domClass.remove(this.result_highlight, "highlighted");
			}
			this.result_highlight = null;
		},

		result_activate: function(el) {
			domClass.add(el, "active-result");
		},

		result_deactivate: function(el) {
			domClass.remove(el, "active-result");
		},

		no_results_clear: function() {
			domConstruct.destroy(query(".no-results", this.search_results).shift());
		},


		test_active_click: function(evt) {

			var clicked_element = query(evt.target).shift();

			if(query(clicked_element).parents('#' + this.container_id).length) {
				return this.active_field = true;
			} else {
				return this.close_field();
			}
		},

		set_tab_index: function() {
			if(domAttr.get(this.form_field, 'tabindex')) {
				var ti = domAttr.get(this.form_field, 'tabindex');
				domAttr.set(this.form_field, 'tabindex', -1);

				if(this.is_multiple) {
					domAttr.set(this.search_field, 'tabindex', ti);
				} else {
					domAttr.set(this.selected_item, 'tabindex', ti);
					domAttr.set(this.search_field, 'tabindex', -1);
				}
			}
		},

		results_build: function() {
			this.results_data = select_to_array.call(this.form_field);

			if(this.is_multiple && this.choices > 0) {
				domConstruct.destroy(query("li.search-choice", this.search_choices).shift());
				this.choices = 0;
			} else if(!this.is_multiple) {
				var _this = this;
				query('span', this.selected_item).forEach(function(child) {
					child.textContent = _this.default_text;
				});

				if(_this.form_field.options.length <= _this.options.disable_search_threshold) {
					domClass.add(_this.container, "chzn-container-single-nosearch");
				} else {
					domClass.remove(_this.container, "chzn-container-single-nosearch");
				}
			}

			var content = '';

			var _ref = this.results_data;
			for(var _i = 0, _len = _ref.length; _i < _len; _i++) {
				var data = _ref[_i];
				if(data.group) {
					content += this.result_add_group(data);
				} else if(!data.empty) {
					content += this.result_add_option(data);
					if(data.selected && this.is_multiple) {
						this.choice_build(data);
					} else if(data.selected && !this.is_multiple) {
						query('span', this.selected_item).shift().textContent = data.text;
						if(this.options.allow_single_deselect) {
							this.single_deselect_control_build();
						}
					}
				}
			}

			this.search_field_disabled();
			this.show_search_field_default();
			this.search_field_scale();
			this.search_results.innerHTML = content;
		},

		choice_build: function(item) {
			var choice_id = this.container_id + "_c_" + item.array_index;
			this.choices += 1;

			var el = domConstruct.create('li', {'id': choice_id});
			domClass.add(el, 'search-choice');


			el.innerHTML = '<span>' + domAttr.get(item, 'value') + '</span><a href="#" class="search-choice-close" rel="' + item.array_index + '"></a>';

			domConstruct.place(el, this.search_container, 'before');

			query('a', el).on('click', lang.hitch(this, function(evt) {
				evt.preventDefault();
				if(!this.is_disabled) {
					this.pending_destroy_click = true;
					this.choice_destroy(evt.target);
				} else {
					evt.stop();
				}
			}));
		},

		choice_destroy: function(link) {
			this.choices -= 1;
			this.show_search_field_default();
			if(this.is_multiple && this.choices > 0 && this.search_field.value.length < 1) {
				this.results_hide();
			}
			this.result_deselect(domAttr.get(link, "rel"));

			domConstruct.destroy(query(link).parent('li')[0]);
		},

		result_deselect: function(pos) {
			var result_data = this.results_data[pos];

			result_data.selected = false;
			this.form_field.options[result_data.options_index].selected = false;

			var result = dom.byId(this.container_id + "_o_" + pos);

			domClass.remove(result, "result-selected");
			domClass.add(result, "active-result");

			this.result_clear_highlight();
			this.winnow_results();

			this.dojo_fire_event("change");
			this.search_field_scale();
		},

		show_search_field_default: function() {
			if(this.is_multiple && this.choices < 1 && !this.active_field) {
				domAttr.set(this.search_field, 'value', this.default_text);
				domClass.add(this.search_field, "default");
			} else {
				domAttr.set(this.search_field, 'value', '');
				domClass.remove(this.search_field, "default");
			}
		},


		search_field_disabled: function() {
			this.is_disabled = domAttr.get(this.form_field, 'disabled');
			if(this.is_disabled) {
				domClass.add(this.container, 'chzn-disabled');
				domAttr.set(this.search_field, 'disabled', true);
				if(!this.is_multiple) {
					if(this.selected_item_focus_handle) {
						this.selected_item_focus_handle.remove();
					}
				}
				this.close_field();
			} else {
				domClass.remove(this.container, 'chzn-disabled');
				domAttr.set(this.search_field, 'disabled', false);

				if(!this.is_multiple) {
					this.selected_item_focus_handle = on(this.selected_item, "focus", lang.hitch(this, this.activate_field));
				}
			}
		},

		close_field: function() {
			if(this.document_click_handle) {
				this.document_click_handle.remove();
			}

			if(!this.is_multiple) {
				domAttr.set(this.selected_item, 'tabindex', domAttr.get(this.search_field, 'tabindex'));
				domAttr.set(this.search_field, 'tabindex', -1);
			}

			this.active_field = false;
			this.results_hide();
			domClass.remove(this.container, "chzn-container-active");
			this.winnow_results_clear();
			this.clear_backstroke();
			this.show_search_field_default();

			this.search_field_scale();
		},

		winnow_results_clear: function() {
			var _this = this;

			domAttr.set(this.search_field, 'value', '');

			query('li', this.search_results).forEach(function(li) {
				(domClass.contains(li, "group-result") || domClass.contains(li, "group-result-selectable")) ? domStyle.set(li, 'display', 'block') : !_this.is_multiple || !domClass.contains(li, "result-selected") ? _this.result_activate(li) : void 0;
			});
		},

		activate_field: function() {
			if(!this.is_multiple && !this.active_field) {
				domAttr.set(this.search_field, 'tabindex', domAttr.get(this.selected_item, 'tabindex'));
				domAttr.set(this.selected_item, 'tabindex', -1);
			}
			domClass.add(this.container, 'chzn-container-active');
			this.active_field = true;

			domAttr.set(this.search_field, 'value', domAttr.get(this.search_field, 'value'));

			this.search_field.focus();
		},

		result_add_group: function(group) {
			if(!group.disabled) {
				group.dom_id = this.container_id + "_g_" + group.array_index;

				if(this.options.batch_select) {
					return '<li id="' + group.dom_id + '" class="group-result-selectable active-result"><div>' + group.label + '</div></li>';
				} else {
					return '<li id="' + group.dom_id + '" class="group-result"><div>' + group.label + '</div></li>';
				}
			} else {
				return '';
			}
		},

		result_add_option: function(option) {
			if(!option.disabled) {
				option.dom_id = this.container_id + "_o_" + option.array_index;
				var classes = option.selected && this.is_multiple ? [] : ["active-result"];

				if(option.selected) {
					classes.push('result-selected');
				}

				if(option.group_array_index != null) {
					classes.push("group-option");
				}

				if(option.classes !== "") {
					classes.push(option.classes);
				}

				var style = option.style.cssText !== '' ? ' style="' + option.style + '"' : '';
				return '<li id="' + option.dom_id + '" class="' + classes.join(' ') + '"' + style + '>' + option.html + '</li>';
			} else {
				return '';
			}
		},

		search_field_scale: function() {
			if(this.is_multiple) {
				var w = 0,
					style_block = {
						position: 'absolute',
						left: '-1000px',
						top: '-1000px'
					},

					styles = domStyle.get(this.search_field);

				style_block['font-size'] = styles.fontSize;
				style_block['font-style'] = styles.fontStyle;
				style_block['font-weight'] = styles.fontWeight;
				style_block['font-family'] = styles.fontFamily;
				style_block['line-height'] = styles.lineHeight;
				style_block['text-transform'] = styles.textTransform;
				style_block['letter-spacing'] = styles.letterSpacing;

				var div = domConstruct.create('div', {
					style: style_block,
					textContent: domAttr.get(this.search_field, 'value')
				}, win.body());

				w = domGeom.position(div).w + 25;

				domConstruct.destroy(div);
				if(w > this.f_width - 10) {
					w = this.f_width - 10;
				}

				domStyle.set(this.search_field, 'width', w + 'px');
				var dd_top = domGeom.position(this.container).h;
				domStyle.set(this.dropdown, 'top', dd_top + 'px');
			}
		},

		generate_random_id: function() {
			var string;
			string = "sel" + this.generate_random_char() + this.generate_random_char() + this.generate_random_char();
			while(dom.byId(string) != null) {
				string += this.generate_random_char();
			}
			return string;
		},

		generate_field_id: function() {
			var new_id;
			new_id = this.generate_random_id();
			this.form_field.id = new_id;
			return new_id;
		},

		generate_random_char: function() {
			var chars, newchar, rand;
			chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
			rand = Math.floor(Math.random() * chars.length);
			return newchar = chars.substring(rand, rand + 1);
		}
	});

	lang.extend(query.NodeList, {
		chosen: function(options) {
			return this.forEach(function(element) {
				if(!domClass.contains(element, "chzn-done")) {
					return new Chosen(element, options);
				}
			});
		}
	});

	function select_to_array() {
		var parser = new SelectParser();

		query('> option', this).forEach(function(child) {
			parser.add_node(child);
		});

		return parser.parsed;
	}

	return Chosen;
});
