dojo.require("dojo.NodeList-traverse");

dojo.extend(dojo.NodeList, {
    chosen:function (options) {
        return this.forEach(function (element) {
            if (!dojo.hasClass(element, "chzn-done")) {
                return new Chosen(element, options);
            }
        });
    }
});

function select_to_array() {
    var parser = new SelectParser();

    dojo.query('>', this).forEach(function (child) {
        parser.add_node(child);
    });

    return parser.parsed;
}

dojo.declare("SelectParser", null, {
    constructor:function () {
        this.options_index = 0;
        this.parsed = [];
    },

    add_node:function (child) {
        if (child.nodeName.toUpperCase() === "OPTGROUP") {
            return this.add_group(child);
        } else {
            return this.add_option(child);
        }
    },

    add_group:function (group) {
        var group_position = this.parsed.length;
        this.parsed.push({
            array_index:group_position,
            group:true,
            label:group.label,
            children:0,
            disabled:group.disabled
        });

        _ref = group.childNodes;
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            option = _ref[_i];
            _results.push(this.add_option(option, group_position, group.disabled));
        }

        return _results;
    },

    add_option:function (option, group_position, group_disabled) {
        if (option.nodeName === "OPTION") {
            if (option.text !== "") {
                if (group_position != null) {
                    this.parsed[group_position].children += 1;
                }

                this.parsed.push({
                    array_index:this.parsed.length,
                    options_index:this.options_index,
                    value:option.value,
                    text:option.text,
                    html:option.innerHTML,
                    selected:option.selected,
                    disabled:group_disabled === true ? group_disabled : option.disabled,
                    group_array_index:group_position,
                    classes:option.className,
                    style:option.style.cssText
                });
            } else {
                this.parsed.push({
                    array_index:this.parsed.length,
                    options_index:this.options_index,
                    empty:true
                });
            }
            return this.options_index += 1;
        }
    }
});

dojo.declare("Chosen", null, {
    constructor:function (element, options) {
        this.document_click_handle = null;
        this.form_field = element;
        this.mouse_on_container = false;
        this.is_multiple = this.form_field.multiple;
        this.is_rtl = dojo.hasClass(this.form_field, 'chzn-rtl');
        this.active_field = false;
        this.choices = 0;
        this.result_single_selected = null;
        this.options = options != null ? options : {};
        this.results_none_found = dojo.getAttr(this.form_field, 'data-no_results_text') || this.options.no_results_text || "No results match";
        this.set_up_html();
        this.register_observers();
        dojo.addClass(this.form_field, 'chzn-done');


    },

    set_up_html:function () {
        if (!dojo.getAttr(this.form_field, 'id')) {
            dojo.setAttr(this.form_field, 'id', this.generate_random_id());
        }

        this.container_id = this.form_field.id.replace(/(:|\.)/g, '_') + "_chzn";

        this.f_width = dojo.position(this.form_field).w;

        this.default_text = dojo.getAttr(this.form_field, 'data-placeholder') ? dojo.getAttr(this.form_field, 'data-placeholder') : "Select Some Options";

        this.container = dojo.create('div', {
            id:this.container_id,
            className:'chzn-container' + (this.is_rtl ? ' chzn-rtl' : '') + " chzn-container-" + (this.is_multiple ? "multi" : "single"),
            style:'width: ' + this.f_width + 'px'
        });

        if (this.is_multiple) {
            this.container.innerHTML = '<ul class="chzn-choices"><li class="search-field"><input type="text" value="' + this.default_text + '" class="default" autocomplete="off" style="width:25px;" /></li></ul><div class="chzn-drop" style="left:-9000px;"><ul class="chzn-results"></ul></div>';
        } else {
            this.container.innerHTML = '<a href="javascript:void(0)" class="chzn-single"><span>' + this.default_text + '</span><div><b></b></div></a><div class="chzn-drop" style="left:-9000px;"><div class="chzn-search"><input type="text" autocomplete="off" /></div><ul class="chzn-results"></ul></div>';
        }

        dojo.setStyle(this.form_field, 'display', 'none')
        dojo.place(this.container, this.form_field, 'after');

        this.dropdown = dojo.query('div.chzn-drop', this.container).shift();

        var dd_top = dojo.position(this.container, false).h;

        var dd_width = this.f_width - (dojo.position(this.dropdown).w - dojo.contentBox(this.dropdown).w);
        dojo.setStyle(this.dropdown, {
            'width':dd_width + "px",
            'top':dd_top + "px"
        });


        this.search_field = dojo.query('input', this.container).shift();
        this.search_results = dojo.query('ul.chzn-results', this.container).shift();
        this.search_field_scale();
        this.search_no_results = dojo.query('li.no-results', this.container).shift();


        if (this.is_multiple) {
            this.search_choices = dojo.query('ul.chzn-choices', this.container).shift();
            this.search_container = dojo.query('li.search-field', this.container).shift();
        } else {
            this.search_container = dojo.query('div.chzn-search', this.container).shift();
            this.selected_item = dojo.query('.chzn-single', this.container).shift();

            var sf_width = dd_width - (dojo.position(this.search_container).w - dojo.contentBox(this.search_container).w) - (dojo.position(this.search_field).w - dojo.contentBox(this.search_field).w);
            dojo.setStyle(this.search_field, 'width', sf_width + 'px');
        }

        this.results_build();
        this.set_tab_index();
        //this.form_field.fireEvent('liszt:ready', this);

    },

    register_observers:function () {

        dojo.connect(this.container, 'mousedown', this, 'container_mousedown');
        dojo.connect(this.container, 'mouseup', this, 'container_mouseup');
        dojo.connect(this.container, 'mouseenter', this, 'mouse_enter');
        dojo.connect(this.container, 'mouseleave', this, 'mouse_leave');


        dojo.connect(this.search_results, 'mouseover', this, 'search_results_mouseover');
        dojo.connect(this.search_results, 'mouseup', this, 'search_results_mouseup');
        dojo.connect(this.search_results, 'mouseout', this, 'search_results_mouseout');

        dojo.subscribe('liszt:updated', this, 'results_update_field');

        dojo.connect(this.search_field, 'blur', this, 'input_blur');
        dojo.connect(this.search_field, 'keyup', this, 'keyup_checker');
        dojo.connect(this.search_field, 'keydown', this, 'keydown_checker');


        if (this.is_multiple) {
            dojo.connect(this.search_choices, 'click', this, 'choices_click');
            dojo.connect(this.search_field, 'focus', this, 'input_focus');
        } else {
            dojo.connect(this.selected_item, 'focus', this, 'activate_field');
        }
    },

    results_update_field:function (select_object) {
           
        if (select_object !== this.form_field) {
            return;
        }
                
        if (!this.is_multiple) {
            this.results_reset_cleanup();
        } else if (this.is_multiple && this.choices > 0) {
            dojo.query("li.search-choice", this.search_choices).forEach(dojo.destroy);
            this.choices = 0;	    
        }
        
        this.result_clear_highlight();
        this.result_single_selected = null;
        return this.results_build();
    },

    input_blur:function (evt) {
        _this = this;
        if (!this.mouse_on_container) {
            this.active_field = false;
            return setTimeout((function () {
                _this.blur_test();
            }), 100);

        }
    },

    results_reset_cleanup:function () {
        dojo.destroy(dojo.query('abbr', this.selected_item).shift());
    },

    blur_test:function (evt) {
        if (!this.active_field && dojo.hasClass(this.container, 'chzn-container-active')) {
            this.close_field();
        }
    },

    container_mouseup:function (evt) {
        if (evt.target.nodeName === "ABBR" && !this.is_disabled) {
            this.results_reset(evt);
        }
    },

    mouse_enter:function () {
        this.mouse_on_container = true;
    },

    mouse_leave:function () {
        this.mouse_on_container = false;
    },

    keyup_checker:function (evt) {
        this.search_field_scale();

        switch (evt.keyCode) {
            case dojo.keys.BACKSPACE:
                if (this.is_multiple && this.backstroke_length < 1 && this.choices > 0) {
                    this.keydown_backstroke();
                } else if (!this.pending_backstroke) {
                    this.result_clear_highlight();
                    this.results_search();
                }
                break;

            case dojo.keys.ENTER:
                evt.preventDefault();
                if (this.results_showing) {
                    this.result_select(evt);
                }
                break;
            case dojo.keys.ESCAPE:
                if (this.results_showing) {
                    this.results_hide();
                }
                break;
            case dojo.keys.TAB:
            case dojo.keys.UP_ARROW:
            case dojo.keys.DOWN_ARROW:
            case dojo.keys.SHIFT:
            case dojo.keys.CTRL:
                break;

            default:
                this.results_search();
        }
    },

    keydown_checker:function (evt) {
        this.search_field_scale();

        if (evt.keyCode !== dojo.keys.BACKSPACE && this.pending_backstroke) {
            this.clear_backstroke();
        }

        switch (evt.keyCode) {
            case dojo.keys.BACKSPACE:
                this.backstroke_length = this.search_field.value.length;
                break;

            case dojo.keys.TAB:
                if (this.results_showing && !this.is_multiple) {
                    this.result_select(evt);
                }
                this.mouse_on_container = false;
                break;

            case dojo.keys.ENTER:
                evt.preventDefault();
                break;

            case dojo.keys.UP_ARROW:
                evt.preventDefault();
                this.keyup_arrow();
                break;

            case dojo.keys.DOWN_ARROW:
                this.keydown_arrow();
                break;
        }
    },

    keydown_arrow:function () {
        if (!this.result_highlight) {
            var first_active = dojo.query("li.active-result", this.search_results).shift();
            if (first_active) {
                this.result_do_highlight(first_active);
            }
        } else if (this.results_showing) {
            var highlighted_node = dojo.query(this.result_highlight).shift();

            var next_sib = dojo.query(this.result_highlight).nextAll("li.active-result")[0];

            if (next_sib) {
                this.result_do_highlight(next_sib);
            }
        }

        if (!this.results_showing) {
            this.results_show();
        }
    },

    keyup_arrow:function () {
        if (!this.results_showing && !this.is_multiple) {
            this.results_show();
        } else if (this.result_highlight) {
            var prev_sib = dojo.query(this.result_highlight).prevAll("li.active-result")[0];

            if (prev_sib) {
                this.result_do_highlight(prev_sib);
            } else {
                if (this.choices > 0) {
                    this.results_hide();
                }
                this.result_clear_highlight();
            }
        }
    },

    results_search:function (evt) {
        if (this.results_showing) {
            this.winnow_results();
        } else {
            this.results_show();
        }
    },

    results_reset:function (evt) {
        this.form_field.options[0].selected = true;
        dojo.query('span', this.selected_item).shift().innerHTML = this.default_text;
        this.show_search_field_default();
        dojo.destroy(evt.target);
        this.dojo_fire_event("change");
        if (this.active_field) {
            this.results_hide();
        }
    },

    choices_click:function (evt) {
        evt.preventDefault();

        if (this.active_field && !(dojo.hasClass(dojo.query(evt.target).shift(), 'search-choice') || (dojo.query(evt.target).parent('.search-choice').length > 0)) && !this.results_showing) {
            this.results_show();
        }
    },

    search_results_mouseout:function (evt) {
        if (dojo.hasClass(dojo.query(evt.target).shift(), 'active-result') || dojo.query(evt.target).parent('.active-result')) {
            this.result_clear_highlight();
        }
    },

    search_results_mouseup:function (evt) {

        var target = dojo.hasClass(dojo.query(evt.target).shift(), 'active-result') ? evt.target : dojo.query(evt.target).parent('.active-result').shift();

        if (target) {
            this.result_highlight = target;
            this.result_select(evt);
        }
    },

    clear_backstroke:function () {
        if (this.pending_backstroke) {
            dojo.removeClass(this.pending_backstroke, "search-choice-focus");
        }
        this.pending_backstroke = null;
    },

    result_select:function (evt) {
        if (this.result_highlight) {
            var high = this.result_highlight, high_id = high.id;
            this.result_clear_highlight();

            var position = high_id.substr(high_id.lastIndexOf("_") + 1);

            var item = this.results_data[position];

            if (this.is_multiple && item.group && this.options.batch_select) {
                // assume multiple
                var siblings = dojo.query(high).nextAll();

                var index = 0;

                while(siblings[index] && !dojo.hasClass(siblings[index], "group-result-selectable")) {
                    if (dojo.hasClass(siblings[index], "active-result")) {


                        var sibling = siblings[index];
                        var sibling_id = sibling.id;
                        var sibling_position = sibling_id.substr(sibling_id.lastIndexOf("_") + 1);
                        var sibling_item = this.results_data[sibling_position];
                        sibling_item.selected = true;
                        this.form_field.options[sibling_item.options_index].selected = true;

                        this.result_deactivate(sibling);

                        dojo.addClass(sibling, "result-selected");

                        this.choice_build(sibling_item);
                    }

                    index++;
                }
            } else {
                if (this.is_multiple) {
                    this.result_deactivate(high);
                } else {
                    var selected = dojo.query(this.search_results, '.result-selected').shift();

                    if (selected) {
                        dojo.removeClass(selected, "result-selected");
                    }
                    this.result_single_selected = high;
                }

                dojo.addClass(high, "result-selected");

                item.selected = true;
                this.form_field.options[item.options_index].selected = true;

                if (this.is_multiple) {
                    this.choice_build(item);
                } else {
                    dojo.query('span', this.selected_item).shift().innerHTML = item.text;
                    if (this.options.allow_single_deselect) {
                        this.single_deselect_control_build();
                    }
                }
            }

            if (!this.is_multiple || !evt.control) {
                this.results_hide();
            }
            dojo.setAttr(this.search_field, 'value', "");
            this.dojo_fire_event("change");

            this.search_field_scale();
        }
    },

    dojo_fire_event:function (event_name) {
        // IE does things differently
        if (dojo.isIE) {
            dojo.query(this.form_field).shift().fireEvent("on" + event_name);
        } else {  // Not IE
            var event = document.createEvent("HTMLEvents");
            event.initEvent(event_name, false, true);
            dojo.query(this.form_field).shift().dispatchEvent(event);
        }
    },

    single_deselect_control_build:function () {
        if (this.options.allow_single_deselect && dojo.query('abbr', this.selected_item).length < 1) {
            dojo.create('abbr', {className:'search-choice-close'}, dojo.query('span', this.selected_item).shift());

        }
    },

    input_focus:function (evt) {
        var _this = this;
        if (!this.active_field) {
            return setTimeout((function () {
                return _this.container_mousedown();
            }), 50);
        }
    },

    container_mousedown:function (evt) {
        if (!this.is_disabled) {

            var target_closelink = evt != null ? dojo.hasClass(evt.target, 'search-choice-close') : false;
            if (evt && evt.type === "mousedown") {
                evt.stopPropagation();
            }

            if (!this.pending_destroy_click && !target_closelink) {
                if (!this.active_field) {
                    if (this.is_multiple) {
                        dojo.setAttr(this.search_field, 'value', '');
                    }

                    this.document_click_handle = dojo.connect(document, 'click', this, 'test_active_click');

                    this.results_show();
                } else if (!this.is_multiple && evt && (evt.target === this.selected_item || dojo.query(evt.target).parents('a.chzn-single').length)) {
                    evt.preventDefault();
                    this.results_toggle();
                }
                this.activate_field();
            } else {
                this.pending_destroy_click = false;
            }
        }

    },

    results_toggle:function () {
        if (this.results_showing) {
            this.results_hide();
        } else {
            this.results_show();
        }
    },


    results_hide:function () {
        if (!this.is_multiple) {
            dojo.removeClass(this.selected_item, "chzn-single-with-drop");
        }

        this.result_clear_highlight();
        dojo.setStyle(this.dropdown, 'left', '-9000px');
        this.results_showing = false;
    },

    search_results_mouseover:function (evt) {

        var target = dojo.hasClass(dojo.query(evt.target).shift(), "active-result") ? evt.target : dojo.query(evt.target).parent(".active-result").shift();

        if (target) {
            this.result_do_highlight(target);
        }
    },

    results_show:function () {

        if (!this.is_multiple) {
            dojo.addClass(this.selected_item, 'chzn-single-with-drop');
            if (this.result_single_selected) {
                this.result_do_highlight(this.result_single_selected);
            }
        }

        var dd_top = this.is_multiple ? dojo.position(this.container).h : dojo.position(this.container).h - 1;

        dojo.setStyle(this.dropdown, {
            top:dd_top + 'px',
            left:'0px'
        });


        this.results_showing = true;
        this.search_field.focus();
        dojo.setAttr(this.search_field, 'value', dojo.getAttr(this.search_field, 'value'));
        this.winnow_results();
    },

    winnow_results:function () {
        this.no_results_clear();

        var results = 0,
            searchText = dojo.getAttr(this.search_field, 'value') === this.default_text ? "" : dojo.trim(dojo.getAttr(this.search_field, 'value')),
            regex = new RegExp('^' + searchText.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"), 'i'),
            zregex = new RegExp(searchText.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"), 'i');

        _this = this;

        dojo.forEach(this.results_data, function (option) {
            if (!option.disabled && !option.empty) {
                if (option.group) {
                    dojo.setStyle(dojo.byId(option.dom_id), 'display', 'none');
                } else if (!(_this.is_multiple && option.selected)) {
                    var found = false,
                        result_id = option.dom_id,
                        result = dojo.byId(result_id);
                    if (regex.test(option.html)) {
                        found = true;
                        results += 1;
                    } else if (option.html.indexOf(" ") >= 0 || option.html.indexOf("[") === 0) {
                        var parts = option.html.replace(/\[|\]/g, "").split(" ");

                        if (parts.length) {
                            dojo.forEach(parts, function (part) {
                                if (regex.test(part)) {
                                    found = true;
                                    results += 1;
                                }
                            });
                        }
                    }

                    if (found) {
                        var text;
                        if (searchText.length) {
                            var startpos = option.html.search(zregex);
                            text = option.html.substr(0, startpos + searchText.length) + '</em>' + option.html.substr(startpos + searchText.length);
                            text = text.substr(0, startpos) + '<em>' + text.substr(startpos);
                        } else {
                            text = option.html;
                        }

                        result.innerHTML = text;
                        _this.result_activate(result);

                        if (option.group_array_index != null) {
                            dojo.setStyle(dojo.byId(_this.results_data[option.group_array_index].dom_id), 'display', 'list-item');
                        }

                    } else {
                        if (_this.result_highlight && result_id === _this.result_highlight.id) {
                            _this.result_clear_highlight();
                        }

                        _this.result_deactivate(result);
                    }
                }
            }
        });

        if (results < 1 && searchText.length) {
            this.no_results(searchText);
        } else {
            this.winnow_results_set_highlight();
        }
    },

    no_results:function (terms) {
        var no_results_html = dojo.create('li', {className:'no-results', innerHTML:this.results_none_found + ' "<span></span>" '}, this.search_results);
        dojo.query('span', no_results_html).shift().innerHTML = terms;
    },


    winnow_results_set_highlight:function () {
        if (!this.result_highlight) {
            var selected_results = !this.is_multiple ? dojo.query(".result-selected", this.search_results) : [];
            var do_high = selected_results.length ? selected_results[0] : dojo.query(".active-result", this.search_results).shift();
            if (do_high != null) {
                this.result_do_highlight(do_high);
            }
        }
    },

    result_do_highlight:function (el) {
        if (el) {
            this.result_clear_highlight();
            this.result_highlight = el;
            dojo.addClass(this.result_highlight, "highlighted");
            var maxHeight = parseInt(dojo.getStyle(this.search_results, "maxHeight"), 10);


            var visible_top = this.search_results.scrollTop,
                visible_bottom = maxHeight + visible_top,
                high_top = (dojo.coords(this.result_highlight).y - dojo.coords(this.search_results).y) + this.search_results.scrollTop,
                high_bottom = high_top + dojo.coords(this.result_highlight).h;


            if (high_bottom >= visible_bottom) {
                this.search_results.scrollTop = (high_bottom - maxHeight) > 0 ? high_bottom - maxHeight : 0;
            } else if (high_top < visible_top) {
                this.search_results.scrollTop = high_top;
            }

        }
    },

    result_clear_highlight:function () {
        if (this.result_highlight) {
            dojo.removeClass(this.result_highlight, "highlighted");
        }
        this.result_highlight = null;
    },

    result_activate:function (el) {
        dojo.addClass(el, "active-result");
    },

    result_deactivate:function (el) {
        dojo.removeClass(el, "active-result");
    },

    no_results_clear:function () {
        dojo.destroy(dojo.query(".no-results", this.search_results).shift());
    },


    test_active_click:function (evt) {

        var clicked_element = dojo.query(evt.target).shift();

        if (dojo.query(clicked_element).parents('#' + this.container_id).length) {
            return this.active_field = true;
        } else {
            return this.close_field();
        }
    },

    set_tab_index:function () {
        if (dojo.getAttr(this.form_field, 'tabindex')) {
            var ti = dojo.getAttr(this.form_field, 'tabindex');
            dojo.setAttr(this.form_field, 'tabindex', -1);

            if (this.is_multiple) {
                dojo.setAttr(this.search_field, 'tabindex', ti);
            } else {
                dojo.setAttr(this.selected_item, 'tabindex', ti);
                dojo.setAttr(this.search_field, 'tabindex', -1);
            }
        }
    },

    results_build:function () {
        this.parsing = true;
        this.results_data = select_to_array.call(this.form_field);

        if (this.is_multiple && this.choices > 0) {
            dojo.destroy(dojo.query("li.search-choice", this.search_choices).shift());
            this.choices = 0;
        } else if (!this.is_multiple) {
            _this = this;
            dojo.query('span', this.selected_item).forEach(function (child) {
                child.innerHTML = _this.default_text;
            });

            if (_this.form_field.options.length <= _this.options.disable_search_threshold) {
                dojo.addClass(_this.container, "chzn-container-single-nosearch");
            } else {
                dojo.removeClass(_this.container, "chzn-container-single-nosearch");
            }
        }

        var content = '';

        _ref = this.results_data;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            data = _ref[_i];
            if (data.group) {
                content += this.result_add_group(data);
            } else if (!data.empty) {
                content += this.result_add_option(data);
                if (data.selected && this.is_multiple) {
                    this.choice_build(data);
                } else if (data.selected && !this.is_multiple) {
                    dojo.query('span', this.selected_item).shift().innerHTML = data.text;
                    if (this.options.allow_single_deselect) {
                        this.single_deselect_control_build();
                    }
                }
            }
        }

        this.search_field_disabled();
        this.show_search_field_default();
        this.search_field_scale();
        this.search_results.innerHTML = content;

        this.parsing = false;
    },

    choice_build:function (item) {     
        var choice_id = this.container_id + "_c_" + item.array_index;
        this.choices += 1;

        var el = dojo.create('li', {'id':choice_id});
        dojo.addClass(el, 'search-choice');


        el.innerHTML = '<span>' + dojo.getAttr(item, 'value') + '</span><a href="#" class="search-choice-close" rel="' + item.array_index + '"></a>';

        dojo.place(el, this.search_container, 'before');

        dojo.query('a', el).onclick(dojo.hitch(this, function (evt) {

            evt.preventDefault();
            if (!this.is_disabled) {
                this.pending_destroy_click = true;
                this.choice_destroy(evt.target);
            } else {
                evt.stop();
            }
        }));
    },

    choice_destroy:function (link) {
        this.choices -= 1;
        this.show_search_field_default();
        if (this.is_multiple && this.choices > 0 && this.search_field.value.length < 1) {
            this.results_hide();
        }
        this.result_deselect(dojo.getAttr(link, "rel"));

        dojo.destroy(dojo.query(link).parent('li')[0]);
        this.pending_destroy_click = false;
    },

    result_deselect:function (pos) {
        var result_data = this.results_data[pos];

        result_data.selected = false;
        this.form_field.options[result_data.options_index].selected = false;

        var result = dojo.byId(this.container_id + "_o_" + pos);

        dojo.removeClass(result, "result-selected")
        dojo.addClass(result, "active-result")

        this.result_clear_highlight();
        this.winnow_results();

        this.dojo_fire_event("change");
        this.search_field_scale();
    },

    show_search_field_default:function () {
        if (this.is_multiple && this.choices < 1 && !this.active_field) {
            dojo.setAttr(this.search_field, 'value', this.default_text);
            dojo.addClass(this.search_field, "default");
        } else {
            dojo.setAttr(this.search_field, 'value', '');
            dojo.removeClass(this.search_field, "default");
        }
    },


    search_field_disabled:function () {
        this.is_disabled = dojo.getAttr(this.form_field, 'disabled');
        if (this.is_disabled) {
            dojo.addClass(this.container, 'chzn-disabled');
            dojo.setAttr(this.search_field, 'disabled', true);
            if (!this.is_multiple) {
                if (!this.selected_item_focus_handle) {
                    dojo.disconnect(this.selected_item_focus_handle);
                }
            }
            this.close_field();
        } else {
            dojo.removeClass(this.container, 'chzn-disabled');
            dojo.setAttr(this.search_field, 'disabled', false);

            if (!this.is_multiple) {
                this.selected_item_focus_handle = dojo.connect(this.selected_item, "focus", this, 'activate_field');
            }
        }
    },

    close_field:function () {
        dojo.disconnect(this.document_click_handle);

        if (!this.is_multiple) {
            dojo.setAttr(this.selected_item, 'tabindex', dojo.getAttr(this.search_field, 'tabindex'));
            dojo.setAttr(this.search_field, 'tabindex', -1);
        }

        this.active_field = false;
        this.results_hide();
        dojo.removeClass(this.container, "chzn-container-active");
        this.winnow_results_clear();
        this.clear_backstroke();
        this.show_search_field_default();

        this.search_field_scale();
    },

    winnow_results_clear:function () {
        _this = this;

        dojo.setAttr(this.search_field, 'value', '');

        dojo.query('li', this.search_results).forEach(function (li) {
            (dojo.hasClass(li, "group-result") || dojo.hasClass(li, "group-result-selectable")) ? dojo.setStyle(li, 'display', 'block') : !_this.is_multiple || !dojo.hasClass(li, "result-selected") ? _this.result_activate(li) : void 0;
        });
    },

    activate_field:function () {
        if (!this.is_multiple && !this.active_field) {
            dojo.setAttr(this.search_field, 'tabindex', dojo.getAttr(this.selected_item, 'tabindex'));
            dojo.setAttr(this.selected_item, 'tabindex', -1);
        }
        dojo.addClass(this.container, 'chzn-container-active');
        this.active_field = true;

        dojo.setAttr(this.search_field, 'value', dojo.getAttr(this.search_field, 'value'));

        this.search_field.focus();
    },

    result_add_group:function (group) {
        if (!group.disabled) {
            group.dom_id = this.container_id + "_g_" + group.array_index;

            if (this.options.batch_select) {
                return '<li id="' + group.dom_id + '" class="group-result-selectable active-result"><div>' + group.label + '</div></li>';
            } else {
                return '<li id="' + group.dom_id + '" class="group-result"><div>' + group.label + '</div></li>';
            }
        } else {
            return '';
        }
    },

    result_add_option:function (option) {
        if (!option.disabled) {
            option.dom_id = this.container_id + "_o_" + option.array_index;
            var classes = option.selected && this.is_multiple ? [] : ["active-result"];

            if (option.selected) {
                classes.push('result-selected');
            }

            if (option.group_array_index != null) {
                classes.push("group-option");
            }

            if (option.classes !== "") {
                classes.push(option.classes);
            }

            var style = option.style.cssText !== '' ? ' style="' + option.style + '"' : '';
            return '<li id="' + option.dom_id + '" class="' + classes.join(' ') + '"' + style + '>' + option.html + '</li>';
        } else {
            return '';
        }
    },

    search_field_scale:function () {
        if (this.is_multiple) {
            var h = 0, w = 0,
                style_block = {
                    position:'absolute',
                    left:'-1000px',
                    top:'-1000px'
                },

                styles = dojo.getStyle(this.search_field);

            style_block['font-size'] = styles.fontSize;
            style_block['font-style'] = styles.fontStyle;
            style_block['font-weight'] = styles.fontWeight;
            style_block['font-family'] = styles.fontFamily;
            style_block['line-height'] = styles.lineHeight;
            style_block['text-transform'] = styles.textTransform;
            style_block['letter-spacing'] = styles.letterSpacing;

            var div = dojo.create('div', {
                style:style_block,
                innerHTML:dojo.getAttr(this.search_field, 'value')
            }, dojo.body());


            w = dojo.position(div).w + 25;

            dojo.destroy(div);
            if (w > this.f_width - 10) {
                w = this.f_width - 10;
            }

            dojo.setStyle(this.search_field, 'width', w + 'px');
            var dd_top = dojo.position(this.container).h;
            dojo.setStyle(this.dropdown, 'top', dd_top + 'px');
        }
    },

    generate_random_id:function () {
        var string;
        string = "sel" + this.generate_random_char() + this.generate_random_char() + this.generate_random_char();
        while (dojo.byId(string) != null) {
            string += this.generate_random_char();
        }
        return string;
    },

    generate_field_id:function () {
        var new_id;
        new_id = this.generate_random_id();
        this.form_field.id = new_id;
        return new_id;
    },

    generate_random_char:function () {
        var chars, newchar, rand;
        chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        rand = Math.floor(Math.random() * chars.length);
        return newchar = chars.substring(rand, rand + 1);
    }
});


