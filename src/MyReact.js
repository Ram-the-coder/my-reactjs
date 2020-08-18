/******************** Public API ********************/ 
var MyReact = {
    createElement,
    render,
    useState
    
};

export default MyReact;

/******************** Implementation ********************/

var workInProgressRoot = null,  // A virtual dom root that is currently being built
    nextUnitOfWork = null, // The node/fiber in the virtual dom that needs to be built next
    currentRoot = null, // A virtual dom that is used to display what is currently in the screen
    deletions = null, // An array of root of dom subtrees which need to be removed from the dom
    workInProgressFiber = null, // A reference to the fiber of the current function component being processed - used by hooks
    hookIndex = null; // There can be multiple hooks within a function component, 
                    // hookIndex indicates which hook to work on next

requestIdleCallback(workLoop);


/***** Function Definitions *****/

function createElement(type, props, ...children) {   
    return {
        type,
        props: {
            ...props,
            children: children.map(wrapChildIfPrimitive)
        }
    };

    function wrapChildIfPrimitive(child) { 
        return typeof child === 'object' 
            ? child 
            : createTextElement(child)
    }
}

function createTextElement(text) {
    return {
        type: 'TEXT_ELEMENT',
        props: {
            nodeValue: text,
            children: []
        }
    }
}

// Create a new virtual dom node/fiber pointing to the container element
function render(element, container) {
    workInProgressRoot = {
        dom: container, // the corresponding dom node for the fiber
        props: {
            children: [element],
        },
        alternate: currentRoot // the stable version of this fiber (oldFiber) - the corresponding fiber that is currently displayed on screen
    }

    deletions = [];
    nextUnitOfWork = workInProgressRoot; //The node/fiber in the virtual dom that needs to be processed next
}

function useState(initial) {
    var oldHook =
        workInProgressFiber.alternate &&
        workInProgressFiber.alternate.hooks &&
        workInProgressFiber.alternate.hooks[hookIndex];

    var hook = {
        state: oldHook ? oldHook.state : initial, // the value
        queue: []
    }

    var actions = oldHook ? oldHook.queue : [];

    actions.forEach(function runAction(action) {
        hook.state = action(hook.state);
    }); 

    workInProgressFiber.hooks.push(hook);
    hookIndex++;
    
    function setState(action) {
        // An action is a function that takes current state and returns new state
        // The action will be executed in the next render
        hook.queue.push(action); 
        // Cause a re-render
        workInProgressRoot = {
            dom: currentRoot.dom,
            props: currentRoot.props,
            alternate: currentRoot
        };
        nextUnitOfWork = workInProgressRoot;
        deletions = [];
    }

    return [hook.state, setState];
}

// Its a watcher that checks if any work needs to be done or not
// It watches the variable nextUnitOfWork
// nextUnitOfWork is initially set by either the render function or the setState function
// Once the workLoop starts the nextUnitOfWork is updated after performing that unit of work to the next unit of work that needs to be performed 
function workLoop(deadline) {
    var shouldYield = false;
    while(nextUnitOfWork && !shouldYield) {
        nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
        shouldYield = deadline.timeRemaining() < 1;
    }

    // commitRoot is called once the virtual dom is fully created
    // with all elements with a corresponding dom element
    // and links to parent, first child and next sibling
    if(!nextUnitOfWork && workInProgressRoot) commitRoot();

    requestIdleCallback(workLoop);
}

// An unit of work is creating a dom element for the current fiber if required 
// and then establish child link for the current fiber and sibling links for its children
// Finally it returns the next unit of work - the fiber that needs to be created next
// Returns nothing (undefined) if there is no more work to be done,
// i.e. the virtual dom has been fully created
function performUnitOfWork(fiber) {
    const isFunctionComponent = fiber.type instanceof Function;

    if(isFunctionComponent) updateFunctionComponent(fiber);
    else updateHostComponent(fiber);    

    // At this point, the current fiber has a dom element created (if needed) 
    // and it has a link to the first child (if it has one)
    // and its children point to the next sibling
    // The children have been diffed with previous virtual dom version and accordingly added tags (updation, placement, deletion)

    // Return next unit of work
    // If the current fiber has a child then that is the next unit of work
    if(fiber.child) return fiber.child;
    {
        // The next unit of work is the the uncle fiber - sibling to the current fiber's parent
        let nextFiber = fiber;
        while(nextFiber) {
            if(nextFiber.sibling) return nextFiber.sibling;
            nextFiber = nextFiber.parent;
        }
    }
}

// Creates sibling links between the children
function updateFunctionComponent(fiber) {
    workInProgressFiber = fiber;
    // initialize hooks related variables
    hookIndex = 0;
    workInProgressFiber.hooks = [];
    var children = [fiber.type(fiber.props)]; // This will call useState if it is used inside the function component
    reconcileChildren(fiber, children);
}

// creates a dom element for the current fiber if not already created
// and establish links
function updateHostComponent(fiber) {
    if(!fiber.dom) fiber.dom = createDom(fiber);
    reconcileChildren(fiber, fiber.props.children);
}

// Link the parent fiber to the first child (elements[0]) and link each node/fiber to its next sibling
// Diff the child and add tags (update, placement, deletion)
function reconcileChildren(parentFiber, elements) {
    var index = 0;
    var oldFiber = parentFiber.alternate && parentFiber.alternate.child;
    var prevSibling = null;

    while(index < elements.length || oldFiber != null) {
        let element = elements[index];
        let newFiber = null;

        // Add tag to child (update, placement, deletion)
        const sameType = 
            oldFiber && 
            element && 
            element.type === oldFiber.type;
        
        if(sameType) {
            newFiber = {
                type: oldFiber.type,
                props: element.props,
                dom: oldFiber.dom, // don't create new dom if no change in type
                parent: parentFiber,
                alternate: oldFiber,
                effectTag: 'UPDATE'
            };
        }
        
        if (element && !sameType) {
            // New node - add this node
            newFiber = {
                type: element.type,
                props: element.props,
                dom: null,
                parent: parentFiber,
                alternate: null,
                effectTag: 'PLACEMENT'
            };
        } 
        
        if(oldFiber && !sameType) {
            // Delete the oldFiber's node
            oldFiber.effectTag = 'DELETION';
            deletions.push(oldFiber);
        }

        // Setup links
        if(index === 0) parentFiber.child = newFiber;
        else if(element) prevSibling.sibling = newFiber;
        
        // For next iteration
        if(oldFiber) oldFiber = oldFiber.sibling;
        prevSibling = newFiber;
        index++;
    }
}

// At the end of this function, the dom tree rooted at workInProgressRoot is commited with all the changes from the virtual dom
// Then the currentRoot points to this updated virtual dom and there is no more workInProgressRoot
function commitRoot() {
    deletions.forEach(commitWork);
    commitWork(workInProgressRoot.child);
    currentRoot = workInProgressRoot;
    workInProgressRoot = null;
}

// Updates all the actual dom nodes in the virtual dom tree, whose root is the current fiber's parent,
// to reflect the changes made
function commitWork(fiber) {
    if(!fiber) return;

    // Update the dom of this fiber 

    // Find the dom element which is supposed to be the immediate parent to the current fiber
    // Only host components have a dom element, function components don't
    var domParentFiber = fiber.parent;
    while(!domParentFiber.dom) domParentFiber = domParentFiber.parent;
    var domParent = domParentFiber.dom;

    if( fiber.effectTag === 'PLACEMENT' && fiber.dom !== null) {
        domParent.appendChild(fiber.dom);
    } else if(fiber.effectTag === 'DELETION') {
        commitDeletion(fiber, domParent);
    } else if(fiber.effectTag === 'UPDATE' && fiber.dom !== null) {
        updateDom({
            dom: fiber.dom,
            prevProps: fiber.alternate.props,
            nextProps: fiber.props
        });
    }

    commitWork(fiber.child); // Update the dom of the fiber's first child
    commitWork(fiber.sibling); // Update the dom of the fiber's next sibling
}

// Delete this fiber's dom element and its children's dom element
function commitDeletion(fiber, domParent) {
    if(fiber.dom) domParent.removeChild(fiber.dom);
    else commitDeletion(fiber.child, domParent);
}

function createDom(fiber) {
    var domNode = 
        fiber.type === 'TEXT_ELEMENT'
            ? document.createTextNode('')
            : document.createElement(fiber.type);

    updateDom({
        dom: domNode, 
        prevProps: {}, 
        nextProps: fiber.props
    });

    return domNode;
}

// Sets the proper event listeners and attributes/props
function updateDom({dom, prevProps, nextProps}) {
    // Remove old or changed event listeners
    Object.keys(prevProps)
        .filter(isEventHandler)
        .filter(function removedOrUpdated(prop) {
            return !(prop in nextProps) || isNewPropChecker(prevProps, nextProps)(prop);
        })
        .forEach(function removeFromDom(eventHandler) {
            var eventType = eventHandler.toLowerCase().substring(2);
            dom.removeEventListener(eventType, prevProps[eventHandler]);
        });

    
    // Remove old props
    Object.keys(prevProps)
        .filter(isProperty)
        .filter(isDeletedPropChecker(prevProps, nextProps))
        .forEach(function removeProp(prop) {
            delete dom[prop];
        })

    // Set neww props
    Object.keys(nextProps)
        .filter(isProperty)
        .filter(isNewPropChecker(prevProps, nextProps))
        .forEach(function addProp(prop) {
            dom[prop] = nextProps[prop];
        })

    // Add the new event listeners
    Object.keys(nextProps)
        .filter(isEventHandler)
        .filter(isNewPropChecker(prevProps, nextProps))
        .forEach(function addToDom(eventHandler) {
            var eventType = eventHandler.toLowerCase().substring(2);
            dom.addEventListener(eventType, nextProps[eventHandler]);
        })
}

function isEventHandler(prop) {
    return prop.startsWith('on');
}

function isProperty(prop) {
    return prop !== 'children' && !isEventHandler(prop);
}

function isNewPropChecker(prev, next) {
    return function isNewProp(prop) {
        return prev[prop] !== next[prop];
    }
} 

function isDeletedPropChecker(prev, next) {
    return function isDeletedProp(prop) {
        return !(prop in next);
    }
}