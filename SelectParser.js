define(["dojo/_base/declare"], function(declare) {

	'use strict';

	return declare([], {

		constructor: function() {
			this.options_index = 0;
			this.parsed = [];
		},

		add_node: function(child) {
			if(child.nodeName.toUpperCase() === "OPTGROUP") {
				return this.add_group(child);
			} else {
				return this.add_option(child);
			}
		},

		add_group: function(group) {
			var group_position = this.parsed.length;
			this.parsed.push({
				array_index: group_position,
				group: true,
				label: group.label,
				children: 0,
				disabled: group.disabled
			});

			var _ref = group.childNodes;
			var _results = [];
			for(var _i = 0, _len = _ref.length; _i < _len; _i++) {
				var option = _ref[_i];
				_results.push(this.add_option(option, group_position, group.disabled));
			}

			return _results;
		},

		add_option: function(option, group_position, group_disabled) {
			if(option.nodeName === "OPTION") {
				if(option.text !== "") {
					if(group_position != null) {
						this.parsed[group_position].children += 1;
					}

					this.parsed.push({
						array_index: this.parsed.length,
						options_index: this.options_index,
						value: option.value,
						text: option.text,
						html: option.innerHTML,
						selected: option.selected,
						disabled: group_disabled === true ? group_disabled : option.disabled,
						group_array_index: group_position,
						classes: option.className,
						style: option.style.cssText
					});
				} else {
					this.parsed.push({
						array_index: this.parsed.length,
						options_index: this.options_index,
						empty: true
					});
				}
				return this.options_index += 1;
			}
		}
	});
});