import MyReact from '../MyReact';

test('createElement', () => {
    var title = MyReact.createElement('h1', null, 'Hello World');
    var element = MyReact.createElement('div', {class: 'container'}, title, 'Second child of container');  
    expect(element).toEqual({
        type: 'div',
        props: {
            class: 'container',
            children: [{
                type: 'h1',
                props: {
                    children: [{
                        type: 'TEXT_ELEMENT',
                        props: {
                            nodeValue: 'Hello World',
                            children: []
                        }
                    }]
                }
            }, {
                type: 'TEXT_ELEMENT',
                props: {
                    nodeValue: 'Second child of container',
                    children: []
                }
            }]
        }
    });
});

test('render', () => {
    var title = MyReact.createElement('h1', null, 'Hello World');
    var element = MyReact.createElement('div', {class: 'container'}, title, 'Second child of container');  
    var root = document.createElement('div');
    MyReact.render(element, root);
    expect(root.innerHTML).toBe(
        '<div><h1>Hello World</h1>Second child of container</div>'
    )
})